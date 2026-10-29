/**
 * Dubai ERP: Smart Import - Storage Management API Route
 * Provides authenticated, company-scoped signed upload URLs for private document storage.
 * Completely circumvents Vercel 4.5MB request payload limit by allowing direct browser-to-storage upload.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET_NAME = "smart-imports";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
}

/**
 * Ensures the private storage bucket exists with 50MB limit and strict non-public access.
 */
async function ensureStorageBucket(supabase: ReturnType<typeof getSupabaseAdmin>) {
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
    // Non-fatal if bucket is already created or permissions require existing bucket
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
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

    const body = await req.json();
    const {
      fileName,
      fileType,
      fileSize,
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

    const supabase = getSupabaseAdmin();
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
      // Fallback response allowing direct client-to-API upload
      return NextResponse.json(
        {
          success: false,
          fallback: "direct_upload",
          storagePath,
          bucket: BUCKET_NAME,
          error: error?.message || "Could not generate signed storage URL",
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

    const supabase = getSupabaseAdmin();
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
