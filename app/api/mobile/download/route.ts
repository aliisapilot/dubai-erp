import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * Secure Mobile Document Proxy Download Endpoint
 * =============================================
 * Validates authentication, generates short-lived signed URLs from private storage,
 * and records access events to public.document_access_logs.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const path = searchParams.get("path");
    const bucket = searchParams.get("bucket") || "cheques";
    const docId = searchParams.get("doc_id") || "unknown";
    const docType = searchParams.get("doc_type") || "document";

    if (!path) {
      return NextResponse.json({ error: "Missing required document path." }, { status: 400 });
    }

    // 1. Session verification
    const authHeader = req.headers.get("authorization");
    let user = null;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data } = await supabase.auth.getUser(token);
      user = data.user;
    } else {
      const { data } = await supabase.auth.getUser();
      user = data.user;
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized file download request." }, { status: 401 });
    }

    // 2. Generate short-lived signed URL (valid for 60 seconds only)
    const { data: signedData, error: signErr } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60);

    if (signErr || !signedData?.signedUrl) {
      return NextResponse.json({ error: `File retrieval failed: ${signErr?.message || "File not found"}` }, { status: 404 });
    }

    // 3. Log sensitive access audit record
    try {
      const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
      const userAgent = req.headers.get("user-agent") || "unknown";

      await supabase.from("document_access_logs").insert({
        company_id: user.user_metadata?.company_id || "00000000-0000-0000-0000-000000000000",
        user_id: user.id,
        user_email: user.email,
        document_type: docType,
        document_id: docId,
        action: "download",
        ip_address: clientIp,
        user_agent: userAgent,
      });
    } catch (logErr) {
      console.warn("Non-fatal access log error:", logErr);
    }

    return NextResponse.json({
      success: true,
      download_url: signedData.signedUrl,
      expires_in: 60,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
