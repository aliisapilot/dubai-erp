/**
 * Dubai ERP: Smart Import - Data Export API Route
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  fetchExportData,
  generateCsvExport,
  generateExcelExport,
  ExportModule,
} from "@/lib/smartImport/exporter";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const moduleName = (searchParams.get("module") || "customers") as ExportModule;
    const format = searchParams.get("format") || "xlsx";

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: companies } = await supabase.from("companies").select("id").limit(1);
    const companyId = companies?.[0]?.id || "";

    const { headers, rows } = await fetchExportData(supabase, moduleName, companyId);

    if (format === "csv") {
      const csvStr = generateCsvExport(headers, rows);
      return new NextResponse(csvStr, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="dubai_erp_${moduleName}_export.csv"`,
        },
      });
    }

    const buffer = generateExcelExport(headers, rows, moduleName);
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="dubai_erp_${moduleName}_export.xlsx"`,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Export failed" },
      { status: 500 }
    );
  }
}
