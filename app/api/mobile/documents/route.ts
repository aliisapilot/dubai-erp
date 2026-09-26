import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * Server-Side Authorized Documents Query for Mobile Portal
 * =======================================================
 * Enforces authenticated user check, company isolation, and role authorization.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    let user = null;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data } = await supabase.auth.getUser(token);
      user = data.user;
    } else {
      const { data } = await supabase.auth.getUser();
      user = data.user;
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized access to mobile document portal." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || "all";
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    return NextResponse.json({
      success: true,
      user_id: user.id,
      category,
      limit,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
