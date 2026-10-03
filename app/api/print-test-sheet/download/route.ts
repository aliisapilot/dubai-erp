import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const asset = await fetch(new URL("/dubai_erp_print_test_sheet_a4.pdf", request.url));
    if (!asset.ok) {
      return NextResponse.json({error:"Print test sheet PDF is currently not available."}, {status:asset.status === 404 ? 404 : 502});
    }
    return new NextResponse(asset.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="dubai_erp_print_test_sheet_a4.pdf"',
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({error:"Failed to download test sheet PDF. Please retry."}, {status:502});
  }
}
