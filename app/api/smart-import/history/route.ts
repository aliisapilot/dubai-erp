/**
 * Dubai ERP: Smart Import - History & Rollback API Route
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rollbackImportBatch } from "@/lib/smartImport/importer";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: batches, error } = await supabase
      .from("import_batches")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      // If table is empty or pending reload, return empty list gracefully
      return NextResponse.json({ batches: [] });
    }

    return NextResponse.json({ batches: batches || [] });
  } catch (err: unknown) {
    return NextResponse.json({ batches: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { batchId } = body as { batchId: string };

    if (!batchId) {
      return NextResponse.json({ error: "Batch ID required" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const result = await rollbackImportBatch(supabase, batchId);
    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Rollback failed" },
      { status: 500 }
    );
  }
}
