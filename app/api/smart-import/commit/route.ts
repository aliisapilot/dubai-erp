/**
 * Dubai ERP: Smart Import - Commit / Save API Route
 * Executes approved records into Supabase in strict relational order (Stage 11-12)
 * using topological dependency resolution.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { executeTopologicalImport } from "@/lib/smartImport/importer";
import type { ParsedDocument } from "@/lib/smartImport/types";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { documents, companyId: requestedCompanyId, userEmail } = body as {
      documents: ParsedDocument[];
      companyId?: string;
      userEmail?: string;
    };

    if (!documents || documents.length === 0) {
      return NextResponse.json({ error: "No documents provided for import." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
      global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    });

    // Multi-tier company resolution matching existing ERP modules
    let resolvedCompany: { id: string; name?: string | null; trn?: string | null } | null = null;

    // Tier 1: Check explicitly requested company ID from authenticated frontend
    if (requestedCompanyId) {
      const { data: coById } = await supabase
        .from("companies")
        .select("id, name, trn")
        .eq("id", requestedCompanyId)
        .maybeSingle();
      if (coById?.id) {
        resolvedCompany = coById;
      }
    }

    let authErrorMessage: string | null = null;

    // Tier 2: Check current authenticated user via Supabase auth session
    if (!resolvedCompany && token) {
      try {
        const { data: authUser, error: authErr } = await supabase.auth.getUser(token);
        if (authErr) {
          authErrorMessage = authErr.message;
        }
        const user = authUser?.user;
        if (user) {
          // Check if owner
          const { data: ownerCo } = await supabase
            .from("companies")
            .select("id, name, trn")
            .eq("owner_id", user.id)
            .maybeSingle();
          if (ownerCo?.id) {
            resolvedCompany = ownerCo;
          } else {
            // Check profile member
            const { data: prof } = await supabase
              .from("profiles")
              .select("company_id")
              .eq("id", user.id)
              .maybeSingle();
            if (prof?.company_id) {
              const { data: memberCo } = await supabase
                .from("companies")
                .select("id, name, trn")
                .eq("id", prof.company_id)
                .maybeSingle();
              if (memberCo?.id) {
                resolvedCompany = memberCo;
              }
            }
          }
        }
      } catch (authErr) {
        console.warn("Auth user lookup skipped:", authErr);
      }
    }

    // Tier 3: Query available company from database
    if (!resolvedCompany) {
      const { data: availableCo } = await supabase
        .from("companies")
        .select("id, name, trn")
        .limit(1)
        .maybeSingle();
      if (availableCo?.id) {
        resolvedCompany = availableCo;
      }
    }

    if (!resolvedCompany?.id) {
      const isExpired = authErrorMessage?.toLowerCase().includes("expired");
      return NextResponse.json(
        {
          error: isExpired
            ? "Your Dubai ERP login session has expired. Please refresh the page to renew your login session."
            : "Company profile not found in ERP. Please ensure you are logged into Dubai ERP and your user account is linked to an active company profile under Settings → Company Settings.",
          recovery: "Navigate to Settings → Company Settings to configure your company profile.",
        },
        { status: 400 }
      );
    }

    const companyId = resolvedCompany.id;

    // Execute import
    const result = await executeTopologicalImport(supabase, companyId, documents, userEmail);

    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("Smart import commit error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Commit failed" },
      { status: 500 }
    );
  }
}
