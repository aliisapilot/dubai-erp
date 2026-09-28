export const runtime = 'edge';

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_PERMISSIONS,
  isMissingMobilePermissionsSchema,
  type MobileDocumentCategory,
} from "@/lib/mobilePortalTypes";

const DOWNLOADABLE_TYPES = new Set<MobileDocumentCategory>(["cheque", "company_file"]);

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Secure Mobile Document Proxy Download Endpoint
 * =============================================
 * Validates authentication, generates short-lived signed URLs from private storage,
 * and records access events to public.document_access_logs.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const docId = searchParams.get("doc_id");
    const docType = searchParams.get("doc_type") as MobileDocumentCategory | null;

    if (!docId || !docType || !DOWNLOADABLE_TYPES.has(docType)) {
      return NextResponse.json({ error: "Invalid document request." }, { status: 400 });
    }

    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const user = userData.user;

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized file download request." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("company_id, mobile_access_enabled, mobile_allowed_doc_types, can_download_documents")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError && !isMissingMobilePermissionsSchema(profileError)) {
      return NextResponse.json({ error: "Document permissions could not be verified." }, { status: 503 });
    }

    const { data: ownedCompanies } = await supabase
      .from("companies")
      .select("id")
      .eq("owner_id", user.id);
    const ownedCompanyIds = new Set((ownedCompanies || []).map((company) => company.id));
    const isOwnerFallback = !profile && ownedCompanyIds.size > 0;
    const allowedTypes = Array.isArray(profile?.mobile_allowed_doc_types)
      ? profile.mobile_allowed_doc_types
      : DEFAULT_PERMISSIONS.allowedCategories;

    if (
      (!profile && !isOwnerFallback) ||
      profile?.mobile_access_enabled === false ||
      profile?.can_download_documents === false ||
      !allowedTypes.includes(docType)
    ) {
      return NextResponse.json({ error: "You do not have permission to open this document." }, { status: 403 });
    }

    let companyId: string | null = null;
    let fileLocation: string | null = null;
    let documentRef: string | null = null;
    let bucket: string | null = null;

    if (docType === "cheque") {
      const { data: cheque, error } = await supabase
        .from("cheques")
        .select("company_id, cheque_number, cheque_image_front_url")
        .eq("id", docId)
        .maybeSingle();
      if (error || !cheque) return NextResponse.json({ error: "Document not found." }, { status: 404 });
      companyId = cheque.company_id;
      documentRef = cheque.cheque_number;
      fileLocation = cheque.cheque_image_front_url;
      bucket = "cheques";
    } else {
      const { data: attachment, error } = await supabase
        .from("document_attachments")
        .select("company_id, file_name, file_url")
        .eq("id", docId)
        .maybeSingle();
      if (error || !attachment) return NextResponse.json({ error: "Document not found." }, { status: 404 });
      companyId = attachment.company_id;
      documentRef = attachment.file_name;
      fileLocation = attachment.file_url;
    }

    const belongsToAuthorizedCompany =
      Boolean(companyId) &&
      (companyId === profile?.company_id || ownedCompanyIds.has(companyId as string));
    if (!belongsToAuthorizedCompany || !fileLocation) {
      return NextResponse.json({ error: "Document access is not permitted." }, { status: 403 });
    }

    let downloadUrl: string;
    if (isHttpUrl(fileLocation)) {
      downloadUrl = fileLocation;
    } else {
      if (!bucket || !fileLocation.startsWith(`${companyId}/`)) {
        return NextResponse.json({ error: "Invalid document storage location." }, { status: 403 });
      }
      const { data: signedData, error: signErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(fileLocation, 60);

      if (signErr || !signedData?.signedUrl) {
        return NextResponse.json({ error: "The stored file could not be retrieved." }, { status: 404 });
      }
      downloadUrl = signedData.signedUrl;
    }

    try {
      const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
      const userAgent = req.headers.get("user-agent") || "unknown";

      await supabase.from("document_access_logs").insert({
        company_id: companyId,
        user_id: user.id,
        user_email: user.email,
        document_type: docType,
        document_id: docId,
        document_ref: documentRef,
        action: "download",
        ip_address: clientIp,
        user_agent: userAgent,
      });
    } catch (logErr) {
      console.warn("Non-fatal access log error:", logErr);
    }

    return NextResponse.json({
      success: true,
      download_url: downloadUrl,
      expires_in: 60,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
