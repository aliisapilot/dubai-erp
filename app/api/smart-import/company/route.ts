/**
 * Dubai ERP: Smart Import - Active Company Resolution API
 * Returns the verified ERP tenant company profile for the authenticated session.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication required. Please sign into Dubai ERP.",
        },
        { status: 401 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // 1. Resolve user from token
    const { data: authUser, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authUser?.user) {
      return NextResponse.json(
        {
          success: false,
          error: authErr?.message || "Session expired. Please refresh your browser or sign in again.",
        },
        { status: 401 }
      );
    }

    const userId = authUser.user.id;

    // 2. Try owner lookup
    const { data: ownerCo } = await supabase
      .from("companies")
      .select("*")
      .eq("owner_id", userId)
      .maybeSingle();

    if (ownerCo?.id) {
      return NextResponse.json({
        success: true,
        company: ownerCo,
      });
    }

    // 3. Try member profile lookup
    const { data: prof } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();

    if (prof?.company_id) {
      const { data: memberCo } = await supabase
        .from("companies")
        .select("*")
        .eq("id", prof.company_id)
        .maybeSingle();

      if (memberCo?.id) {
        return NextResponse.json({
          success: true,
          company: memberCo,
        });
      }
    }

    // 4. Try active company select (scoped by RLS)
    const { data: anyCo } = await supabase
      .from("companies")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (anyCo?.id) {
      return NextResponse.json({
        success: true,
        company: anyCo,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error:
          "Company profile not found in ERP. Please ensure you are logged into Dubai ERP and your user account is linked to an active company profile under Settings → Company Settings.",
        recovery: "Navigate to Settings → Company Settings to configure your company profile.",
      },
      { status: 404 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal error resolving company profile.",
      },
      { status: 500 }
    );
  }
}
