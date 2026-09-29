import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";

export async function GET() {
  try {
    const pdfPath = join(process.cwd(), "public", "dubai_erp_print_test_sheet_a4.pdf");

    if (!existsSync(pdfPath)) {
      return NextResponse.json(
        { error: "Print test sheet PDF is currently not available. Please retry in a moment." },
        { status: 404 }
      );
    }

    const fileBuffer = readFileSync(pdfPath);

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="dubai_erp_print_test_sheet_a4.pdf"',
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to download test sheet PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
