/**
 * Dubai ERP: Smart Import - Download Templates API Route
 */

import { NextRequest, NextResponse } from "next/server";
import { generateTemplateWorkbook, TemplateType } from "@/lib/smartImport/templateGenerator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = (searchParams.get("type") || "customers") as TemplateType;

    const buffer = generateTemplateWorkbook(type);

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="dubai_erp_template_${type}.xlsx"`,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate template." },
      { status: 500 }
    );
  }
}
