/**
 * Dubai ERP: Authenticated Server-Side A4 PDF Generation API
 * ============================================================
 * Renders desktop & mobile documents via headless Chromium (`lib/serverPdfRenderer.ts`)
 * at fixed desktop A4 dimensions with embedded Arabic/English fonts.
 *
 * Security:
 * - Enforces authenticated Supabase user session + company membership (`resolveCompanyContext`).
 * - Blocks unauthenticated callers (401) and cross-company callers (403).
 * - Disables JS execution and blocks external outbound network requests inside Chromium.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveCompanyContext } from "@/app/api/customer-statements/route";
import { renderPdfFromHtmlSheets } from "@/lib/serverPdfRenderer";
import { normalizePdfFilename } from "@/lib/exportDocumentPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface PdfRenderRequestBody {
  companyId?: string;
  sheetsHtml?: string[];
  cssText?: string;
  assets?: Record<string, string>;
  filename?: string;
  title?: string;
  landscape?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await resolveCompanyContext(req);
    if (!ctx.ok) {
      return NextResponse.json({ success: false, error: ctx.error }, { status: ctx.status });
    }

    const rawText = await req.text();
    if (rawText.length > 8 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "PDF payload too large." },
        { status: 413 }
      );
    }

    let body: PdfRenderRequestBody;
    try {
      body = JSON.parse(rawText) as PdfRenderRequestBody;
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON payload." }, { status: 400 });
    }

    if (body.companyId && body.companyId !== ctx.companyId) {
      const checkCtx = await resolveCompanyContext(req, body.companyId);
      if (!checkCtx.ok) {
        return NextResponse.json({ success: false, error: checkCtx.error }, { status: checkCtx.status });
      }
    }

    if (!Array.isArray(body.sheetsHtml) || body.sheetsHtml.length === 0 || body.sheetsHtml.length > 100) {
      return NextResponse.json(
        { success: false, error: "Valid document sheetsHtml array (1..100 pages) is required." },
        { status: 400 }
      );
    }

    const safeFilename = normalizePdfFilename(body.filename || body.title || "Document");
    const asciiFallback = safeFilename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");

    const pdfBuffer = await renderPdfFromHtmlSheets({
      sheetsHtml: body.sheetsHtml,
      cssText: body.cssText,
      assets: body.assets,
      landscape: Boolean(body.landscape),
      title: body.title || safeFilename.replace(/\.pdf$/i, ""),
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
        "Cache-Control": "no-store, private",
        "X-Pdf-Engine": "server-chromium-a4",
      },
    });
  } catch (err: unknown) {
    console.error("[API /api/pdf/render] PDF generation failed:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to generate PDF.",
      },
      { status: 500 }
    );
  }
}
