# 🛡️ Dubai ERP — Automated Database Backup & Disaster Recovery Guide

This document details the architecture, configuration, cost profile, and operational runbook for automated database backups for the live **Dubai ERP** connected to Supabase (`fdporzhjpfpvdwapkvan.supabase.co`).

---

## 1. Backup Strategy Overview

A robust enterprise backup strategy follows the **3-2-1 rule**:
- **3** copies of data (Production database, Intra-platform snapshot, Off-site archive).
- **2** different storage formats/media.
- **1** copy stored completely off-site in an isolated cloud provider.

| Tier | Backup Layer | Location | Frequency & Retention | Purpose |
|---|---|---|---|---|
| **Tier 1** | **Native Supabase Backups** | Supabase Platform (AWS managed) | Daily / 7-day retention (Pro tier) | Rapid in-dashboard point-in-time or snapshot recovery |
| **Tier 2** | **Automated Off-Site Backups** | Cloudflare R2 or AWS S3 | Daily at 02:00 UTC (06:00 GST) / 30-day retention | Off-site disaster recovery, platform outage protection, audit compliance |

---

## 2. Infrastructure Costs & Plan Requirements

| Service | Plan / Requirement | Monthly Cost | Notes |
|---|---|---|---|
| **Supabase** | Free Plan | $0 | No automated backups or PITR. Projects pause after inactivity. Off-site workflow is **mandatory**. |
| **Supabase** | Pro Plan ($25/mo) | $25/mo | Includes 7-day automated daily snapshots natively. Off-site workflow provides long-term retention & multi-cloud DR. |
| **Cloudflare R2** (Recommended) | Free Tier | **$0/mo** | 10 GB free monthly storage, **$0 egress fees** (free downloads), private S3-compatible API. |
| **AWS S3** (Alternative) | Standard S3 | ~$0.05/mo | 5 GB free for 12 months; ~$0.023/GB/month thereafter. |
| **GitHub Actions** | Standard Runner | **$0/mo** | Included in standard free monthly GitHub Actions minutes. |

> [!TIP]
> **Cloudflare R2 is strongly recommended** as the off-site destination because it provides 10 GB permanently free storage with **zero bandwidth/egress transfer fees**, keeping your backup infrastructure completely free.

---

## 3. GitHub Actions Workflow Architecture

The automated backup pipeline is defined in `.github/workflows/database-backup.yml`:

```mermaid
flowchart TD
    Trigger([Schedule 02:00 UTC or Manual Dispatch]) --> SpinRunner[Ubuntu Runner + PostgreSQL Client 16]
    SpinRunner --> Dump[pg_dump --no-owner --clean]
    Dump --> Compress[gzip -9 + SHA-256 Checksum]
    Compress --> Verify[Integrity Verification: Archive & Core ERP Tables]
    Verify -->|Passed| Upload[Encrypted Upload to Cloudflare R2 / AWS S3]
    Upload --> Prune[Apply Retention: Delete dumps > 30 days]
    Prune --> Summary[GitHub Step Summary + Alert on Failure]
    Verify -->|Failed| Alert[Halt Pipeline & Alert Owner]
```

### Safety Features:
1. **Zero Production Modification**: Only runs read-only `pg_dump`. It never runs `ALTER`, `DROP`, `UPDATE`, or `RESTORE` commands against Supabase.
2. **Credential Protection**: Connection strings and storage keys are read strictly from encrypted GitHub Actions Secrets. They are automatically masked in workflow logs.
3. **Data Protection**: Database dumps are uploaded directly to your private cloud bucket. They are **never** committed to Git and are **never** left as public or permanent GitHub artifacts.
4. **Integrity Verification**: Before uploading, the workflow confirms:
   - `pg_dump` exited without error.
   - Archive integrity via `gzip -t`.
   - Core ERP business tables (`companies`, `tax_invoices`, `quotations`, `customers`, `employees`) exist in the dump.
   - Minimum dump file size threshold is satisfied.

---

## 4. Manual Configuration Steps

To activate automated backups, follow these 3 simple configuration steps:

### Step 1: Obtain the Supabase Direct Connection String

1. Log in to [Supabase Dashboard](https://supabase.com/dashboard/project/fdporzhjpfpvdwapkvan).
2. Go to **Project Settings** (gear icon) ➔ **Database**.
3. Under **Connection string**, select the **URI** tab.
4. Copy the connection string. It will look like:
   ```text
   postgresql://postgres:[YOUR-PASSWORD]@db.fdporzhjpfpvdwapkvan.supabase.co:5432/postgres?sslmode=require
   ```
   *(Or if using connection pooler, port 6543 with Session mode).*
5. Replace `[YOUR-PASSWORD]` with your actual Supabase database password.

---

### Step 2: Set Up Off-Site Storage (Cloudflare R2 or AWS S3)

#### Option A: Cloudflare R2 (Recommended — 100% Free)
1. Sign in to [Cloudflare Dashboard](https://dash.cloudflare.com/) ➔ **R2 Object Storage**.
2. Click **Create bucket**, name it `dubai-erp-backups` (choose default location).
3. Under **Bucket Settings**, you can optionally set an Object Lifecycle rule (e.g., Delete objects after 30 days).
4. Go to **Manage R2 API Tokens** ➔ **Create API Token**:
   - Permission: **Object Read & Write**.
   - Specify bucket: `dubai-erp-backups`.
5. Note down:
   - **Access Key ID**
   - **Secret Access Key**
   - **Endpoint URL**: `https://<account_id>.r2.cloudflarestorage.com`

#### Option B: AWS S3
1. Create a private S3 bucket named `dubai-erp-backups` in your preferred region (e.g. `me-central-1` UAE or `eu-west-1`).
2. Block all public access.
3. Enable Default Encryption (SSE-S3).
4. Create an IAM User with AmazonS3FullAccess policy scoped to the bucket.
5. Generate an Access Key ID & Secret Access Key.

---

### Step 3: Add Repository Secrets in GitHub

1. Go to your GitHub repository: `https://github.com/aliisapilot/dubai-erp/settings/secrets/actions`
2. Click **New repository secret** and add the following 5 secrets:

| Secret Name | Description | Example Value |
|---|---|---|
| `SUPABASE_DB_URL` | Full PostgreSQL URI with password | `postgresql://postgres:secret@db.fdporzhjpfpvdwapkvan.supabase.co:5432/postgres?sslmode=require` |
| `BACKUP_STORAGE_ACCESS_KEY_ID` | R2 / AWS Access Key ID | `e4b...` |
| `BACKUP_STORAGE_SECRET_ACCESS_KEY` | R2 / AWS Secret Access Key | `9f7...` |
| `BACKUP_STORAGE_BUCKET` | Destination Bucket Name | `dubai-erp-backups` |
| `BACKUP_STORAGE_ENDPOINT` | Endpoint URL (for Cloudflare R2) | `https://<account_id>.r2.cloudflarestorage.com` *(Leave blank for AWS S3)* |

*(Optional secret: `BACKUP_STORAGE_REGION` — defaults to `auto` for R2 or `us-east-1`).*

---

## 5. Running and Testing the Backup Workflow

### Trigger a Manual Backup
1. In GitHub, go to **Actions** ➔ **Automated Database Backup**.
2. Click **Run workflow**.
3. (Optional) Check **Dry run** to test `pg_dump` and integrity validation without uploading to cloud storage.
4. Click **Run workflow**.
5. Once completed, view the **Job Summary** to inspect the archive size, table integrity checks, and SHA-256 hash.

---

## 6. Isolated Safe Restore-Test Procedure

> [!CAUTION]
> **NEVER RESTORE AGAINST PRODUCTION:**
> Never execute restore commands against `fdporzhjpfpvdwapkvan.supabase.co`. Always use an isolated test environment.

### Option A: Local Docker Restore Test (Automated)

We have provided automated scripts that spin up an isolated local PostgreSQL container, restore the backup, verify table counts, and immediately destroy the container:

**On Windows (PowerShell):**
```powershell
.\scripts\verify_backup_and_restore.ps1 -BackupFile .\dubai_erp_backup_YYYY-MM-DD_HHmmss.sql.gz
```

**On Linux / macOS / WSL (Bash):**
```bash
chmod +x ./scripts/verify_backup_and_restore.sh
./scripts/verify_backup_and_restore.sh ./dubai_erp_backup_YYYY-MM-DD_HHmmss.sql.gz
```

### Option B: Test Restore to an Isolated Supabase Staging Project

1. Create a free temporary project in Supabase (e.g. `dubai-erp-test-restore`).
2. Obtain its direct connection string.
3. Run restore safely using `psql`:
   ```bash
   gunzip -c dubai_erp_backup_YYYY-MM-DD_HHmmss.sql.gz | psql "$TEST_SUPABASE_DB_URL"
   ```
4. Query the restored test project to verify records:
   ```sql
   SELECT count(*) FROM companies;
   SELECT count(*) FROM tax_invoices;
   SELECT count(*) FROM quotations;
   SELECT count(*) FROM customers;
   ```
5. Confirm counts match your live ERP, then delete the temporary test project.
