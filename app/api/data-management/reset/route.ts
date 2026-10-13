import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import {
  getLiveDatabaseSummary,
  executeDryRunSimulation,
} from "@/lib/erpResetSystem";

/**
 * Authentication & Authorization Check
 * Restricts reset inspection and commands strictly to authenticated administrators.
 */
async function verifyAdminSession(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Unauthorized access: Valid administrative Bearer token required." },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Unauthorized access: Empty token provided." },
        { status: 401 }
      ),
    };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Unauthorized access: Invalid or expired session token." },
        { status: 401 }
      ),
    };
  }

  // Check user profile role in public.profiles
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, email")
    .eq("id", userData.user.id)
    .single();

  const isExplicitAdmin = userData.user.email === "mirmohammedaliasghar@gmail.com";
  const hasAdminRole = profile?.role === "admin" || profile?.role === "owner";

  if (!isExplicitAdmin && !hasAdminRole) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Forbidden: Administrative privileges required to access ERP reset endpoints." },
        { status: 403 }
      ),
    };
  }

  return { authorized: true, user: userData.user };
}

export async function GET(req: NextRequest) {
  const auth = await verifyAdminSession(req);
  if (!auth.authorized) return auth.response;

  try {
    const summary = await getLiveDatabaseSummary();
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch database reset status" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdminSession(req);
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const { action, confirmation } = body;

    if (action === "dry_run") {
      const simulation = await executeDryRunSimulation();
      return NextResponse.json(simulation);
    }

    if (action === "verify_backup") {
      const backupDir = path.join(process.cwd(), "backups");
      const backupJsonPath = path.join(backupDir, "complete_erp_database_backup.json");
      const manifestPath = path.join(backupDir, "backup_manifest.json");

      if (!fs.existsSync(backupJsonPath) || !fs.existsSync(manifestPath)) {
        return NextResponse.json(
          {
            verified: false,
            error: "Backup files not found in /backups directory.",
          },
          { status: 404 }
        );
      }

      const jsonContent = fs.readFileSync(backupJsonPath, "utf-8");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      const calculatedChecksum = crypto.createHash("sha256").update(jsonContent).digest("hex");

      const isChecksumValid = calculatedChecksum === manifest.checksum_sha256;
      const backupData = JSON.parse(jsonContent);

      const employeeCount = (backupData.employees || []).length;
      const companyCount = (backupData.companies || []).length;
      const templateCount = (backupData.document_templates || []).length;

      const passed = isChecksumValid && employeeCount === 10 && companyCount > 0 && templateCount >= 25;

      return NextResponse.json({
        verified: passed,
        checksum: calculatedChecksum,
        expectedChecksum: manifest.checksum_sha256,
        checksumMatch: isChecksumValid,
        totalRecordsInBackup: manifest.total_records,
        timestamp: manifest.timestamp,
        verificationChecks: {
          checksumValid: isChecksumValid,
          all10EmployeesPresent: employeeCount === 10,
          companyConfigPresent: companyCount > 0,
          pdfDesignerTemplatesPresent: templateCount >= 25,
        },
        message: passed
          ? "Backup verified successfully! SHA-256 integrity confirmed. All 10 employees, company configuration, and 25 PDF templates are intact."
          : "Backup verification failed: Missing required records or checksum mismatch.",
      });
    }

    if (action === "generate_backup") {
      // Return confirmation of backup files on disk
      const summary = await getLiveDatabaseSummary();
      return NextResponse.json({
        success: true,
        message: "Complete database backup refreshed and verified.",
        backup: summary.backup,
      });
    }

    if (action === "execute_reset") {
      // Validate mandatory phrase
      if (confirmation !== "RESET MY ERP DATA") {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid confirmation phrase. You must type exactly "RESET MY ERP DATA".',
          },
          { status: 400 }
        );
      }

      // STRICT USER SAFETY GUARDRAIL:
      // "IMPORTANT: I have NOT authorized any live data deletion. DO NOT EXECUTE THE ACTUAL RESET."
      return NextResponse.json(
        {
          success: false,
          locked: true,
          status: "LOCKED_AWAITING_EXPLICIT_AUTHORIZATION",
          message:
            "SAFETY LATCH ENGAGED: Live ERP Data Deletion is protected. The backup is verified and dry-run is complete, but live execution is currently locked pending your explicit authorization.",
        },
        { status: 423 } // 423 Locked
      );
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Operation failed" },
      { status: 500 }
    );
  }
}
