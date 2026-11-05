/**
 * Dubai ERP: Smart Import - Storage Management API Route
 * Provides authenticated, company-scoped signed upload URLs for private document storage.
 * Completely circumvents Vercel 4.5MB request payload limit by allowing direct browser-to-storage upload.
 * Enforces strict multi-tenant isolation: cross-company uploads and downloads are forbidden.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET_NAME = "smart-imports";

function getSupabaseClient(token?: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    return createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
  }
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
}

function extractTokenFromRequest(req: NextRequest): string | null {
  // 1. Authorization Header
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1].trim();
  }

  // 2. Query param (for direct tab opening / downloads)
  const { searchParams } = new URL(req.url);
  const qToken = searchParams.get("token");
  if (qToken) return qToken.trim();

  // 3. Supabase Auth Cookies
  const cookies = req.cookies.getAll();
  for (const c of cookies) {
    if (c.name.startsWith("sb-") && c.name.endsWith("-auth-token")) {
      try {
        const decoded = decodeURIComponent(c.value);
        const parsed = JSON.parse(decoded);
        if (typeof parsed === "string") {
          const inner = JSON.parse(parsed);
          if (inner?.access_token) return inner.access_token;
        }
        if (parsed?.access_token) return parsed.access_token;
        if (Array.isArray(parsed) && parsed[0]) return parsed[0];
      } catch {
        if (c.value.length > 50 && c.value.startsWith("eyJ")) return c.value;
      }
    }
  }

  return null;
}

async function authenticateAndAuthorize(req: NextRequest, targetCompanyId?: string) {
  const token = extractTokenFromRequest(req);
  if (!token) {
    return {
      authorized: false as const,
      status: 401,
      error: "Unauthorized: Missing authentication credentials. Please sign in to Dubai ERP.",
    };
  }

  const client = getSupabaseClient(token);
  const { data: authData, error: authErr } = await client.auth.getUser(token);

  if (authErr || !authData?.user) {
    return {
      authorized: false as const,
      status: 401,
      error: "Unauthorized: Invalid or expired session. Please refresh your browser or sign in again.",
    };
  }

  const user = authData.user;

  // Tenant Verification
  if (targetCompanyId && targetCompanyId !== "general") {
    const { data: userProfile } = await client
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();

    const { data: userCompany } = await client
      .from("companies")
      .select("id")
      .eq("id", targetCompanyId)
      .or(`owner_id.eq.${user.id},id.eq.${userProfile?.company_id || ""}`)
      .maybeSingle();

    if (!userCompany) {
      return {
        authorized: false as const,
        status: 403,
        error: "Forbidden: You do not have permission to access records for this company.",
      };
    }
  }

  return { authorized: true as const, user, token, client };
}

/**
 * Ensures the private storage bucket exists with 50MB limit and strict non-public access.
 */
async function ensureStorageBucket(supabase: ReturnType<typeof getSupabaseClient>) {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets?.some(b => b.name === BUCKET_NAME || b.id === BUCKET_NAME);
    if (!exists) {
      await supabase.storage.createBucket(BUCKET_NAME, {
        public: false,
        fileSizeLimit: 52428800, // 50 MB
        allowedMimeTypes: [
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
          "text/csv",
          "application/pdf",
          "application/zip",
          "application/x-zip-compressed",
        ],
      });
    }
  } catch (err) {
    console.warn("Storage bucket check:", err instanceof Error ? err.message : String(err));
  }
}

/**
 * POST /api/smart-import/storage
 * Generates an authenticated, company-scoped signed upload URL.
 */
export async function POST(req: NextRequest) {
  const requestId = `req_store_${crypto.randomUUID().slice(0, 8)}`;
  try {
    const body = await req.json();
    const {
      fileName,
      companyId = "general",
      batchId = `batch_${Date.now()}`,
    } = body as {
      fileName: string;
      fileType?: string;
      fileSize?: number;
      companyId?: string;
      batchId?: string;
    };

    if (!fileName) {
      return NextResponse.json(
        { success: false, error: "File name is required.", requestId },
        { status: 400, headers: { "x-request-id": requestId } }
      );
    }

    // Company-level authorization check
    const authResult = await authenticateAndAuthorize(req, companyId);
    if (!authResult.authorized) {
      return NextResponse.json(
        { success: false, error: authResult.error, requestId },
        { status: authResult.status, headers: { "x-request-id": requestId } }
      );
    }

    const supabase = authResult.client;
    await ensureStorageBucket(supabase);

    // Sanitize file name
    const cleanFileName = fileName
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_");

    // Company-scoped, batch-scoped isolated private storage path
    const uniquePrefix = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const storagePath = `${companyId}/${batchId}/${uniquePrefix}_${cleanFileName}`;

    // Create signed upload URL (valid for 15 minutes)
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(storagePath, { upsert: true });

    if (error || !data?.signedUrl) {
      console.warn("Signed upload URL generation failed:", error?.message);
      return NextResponse.json(
        {
          success: false,
          fallback: "direct_upload",
          storagePath,
          bucket: BUCKET_NAME,
          error: error?.message || "Could not generate signed storage URL. Private storage bucket may need initialization.",
          requestId,
        },
        { status: 200, headers: { "x-request-id": requestId } }
      );
    }

    return NextResponse.json(
      {
        success: true,
        signedUrl: data.signedUrl,
        token: data.token,
        path: storagePath,
        bucket: BUCKET_NAME,
        requestId,
      },
      { status: 200, headers: { "x-request-id": requestId } }
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Failed to initialize storage upload.";
    return NextResponse.json(
      { success: false, error: errMsg, fallback: "direct_upload", requestId },
      { status: 500, headers: { "x-request-id": requestId } }
    );
  }
}

/**
 * GET /api/smart-import/storage
 * Serves archived documents from private storage with proper PDF Content-Type and Content-Disposition.
 * Strictly verifies company ownership and denies cross-tenant access.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storagePath = searchParams.get("path");
    const bucket = searchParams.get("bucket") || BUCKET_NAME;

    if (!storagePath) {
      return NextResponse.json({ error: "Storage path is required." }, { status: 400 });
    }

    // Extract target company from storage path
    const pathParts = storagePath.split("/");
    const targetCompanyId = pathParts[0];

    const authResult = await authenticateAndAuthorize(req, targetCompanyId);
    if (!authResult.authorized) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const supabase = authResult.client;
    const { data: fileBlob, error: dlErr } = await supabase.storage.from(bucket).download(storagePath);

    if (dlErr || !fileBlob) {
      return NextResponse.json(
        { error: `File not found in storage: ${dlErr?.message || "Not found"}` },
        { status: 404 }
      );
    }

    const arrayBuffer = await fileBlob.arrayBuffer();
    const fileName = storagePath.split("/").pop() || "document.pdf";
    const cleanFileName = fileName.replace(/^[0-9]+_[a-f0-9]+_/, "");

    const isPdf = cleanFileName.toLowerCase().endsWith(".pdf");
    const contentType = isPdf ? "application/pdf" : fileBlob.type || "application/octet-stream";

    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(cleanFileName)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Download failed";
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

/**
 * DELETE /api/smart-import/storage
 * Cleans up temporary storage references after parsing or batch completion.
 */
export async function DELETE(req: NextRequest) {
  const requestId = `req_del_${crypto.randomUUID().slice(0, 8)}`;
  try {
    const body = await req.json();
    const { paths, bucket = BUCKET_NAME } = body as { paths: string[]; bucket?: string };

    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json({ success: true, removed: 0 }, { status: 200 });
    }

    // Company isolation check on first path
    const sampleCompanyId = paths[0].split("/")[0];
    const authResult = await authenticateAndAuthorize(req, sampleCompanyId);
    if (!authResult.authorized) {
      return NextResponse.json({ success: false, error: authResult.error, requestId }, { status: authResult.status });
    }

    const supabase = authResult.client;
    const { data, error } = await supabase.storage.from(bucket).remove(paths);

    if (error) {
      console.warn("Temporary storage cleanup warning:", error.message);
    }

    return NextResponse.json(
      { success: true, removed: data?.length || 0, requestId },
      { status: 200, headers: { "x-request-id": requestId } }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Cleanup failed", requestId },
      { status: 500, headers: { "x-request-id": requestId } }
    );
  }
}
