# PDF Designer review — 29 September 2026

Base: `4de234461adeb86f1b1605f9b9dc2ba79480cc17` (main). All 198 files were verified against GitHub blob hashes before editing. Existing local checkouts were preserved. Local Git authentication was unavailable; source access used the connected GitHub account.

## Changes

- Auto Fix now enables saved-style Auto Fit, automatic spacing and overflow protection instead of reapplying an identical layout. It preserves saved elements, images, borders, background, fitting strategy and minimum sizes. The result remains a draft until the user saves to cloud.
- The fitting engine respects custom table text/header sizes and row-height floors in all fitting tiers and multi-page rendering. Pagination measures wrapped rows at the same font size used for rendering.
- The minimum-font control correctly labels existing values as CSS pixels and exposes the model's supported maximum of 12. No existing stored size is converted or rewritten.
- A new corrective migration prevents creating a same-name style from silently overwriting an existing style. Existing updates still require the correct template ID and version. The client explains how to resolve a name collision.
- Existing editable elements, independent scroll regions and printer-border rendering remain in place; their regression checks pass.

## Validation

- `npm run build`: passed with dummy Supabase build settings, not production credentials. TypeScript passed. Edge-runtime deprecation warning remains.
- `npm run lint`: zero errors, 37 warnings in existing code.
- `npm run test:pdf`: 24 checks passed.
- `npm run test:auto-fit`: passed saved-style preservation, idempotence, custom size floors in all modes, short A4 fit and complete pagination across 4/15/30/60 rows.
- `npm run test:design-cloud`: passed using isolated PGlite. Includes legacy row preservation, migration snapshot, rerunnable corrective migration, same-name collision without data/version changes, full JSON/assets round trip, fresh sessions, stale/concurrent writes, shared selection and company/RLS isolation.
- Actual React renderer inspected in the browser using sample data: 30 rows at a 12px minimum and 9mm row floor produced three pages (12/12/6 rows), with no element scroll overflow detected. Four rows produced one page; 60 produced six. These are sample results, not guarantees for arbitrary custom layouts.
- Dependencies were reused from the earlier local checkout after a fresh offline installation failed on npm-cache access. The native Next.js build passed, but a clean installation in CI remains recommended.
- Automated headless Chrome PDF export failed because Chrome's GPU subprocess could not start in this environment. Physical paper output and live two-device Supabase sessions have not been verified.

## Migration review and release gate

`20261002000000_fix_write_design_name_conflict.sql` permits name-match overwrites without knowing the target version. Do not deploy it alone. The new `20261003000000_preserve_design_on_name_collision.sql` replaces only `write_document_design` and its grants; it does not update or delete design rows, selections or business records. The test suite now executes the durable-design migration, the name-conflict migration, then the correction.

Before an approved production migration, inspect `supabase/audits/document_design_preflight.sql`, confirm which migrations are applied, and securely export existing cloud designs with `scripts/backup_document_designs.ps1`. Export browser-only designs from each device too. Verify the backup is readable before applying anything. No production backup or migration was performed in this review. Do not blindly replay older migrations or roll back to the unsafe name-match function.

GitHub reports Vercel success for the base commit. This is deployment-status evidence, not a check of the live database or browser session. The alternate Cloudflare configuration uses deprecated `@cloudflare/next-on-pages` 1.13.16, whose lockfile peer range is Next.js >=14.3.0 through 15.5.2, while this app uses 16.3.5. `.npmrc` suppresses peer checks. Treat that alternate build as unverified; do not switch providers as part of this fix. Reference: https://github.com/cloudflare/next-on-pages.

After production approval: take and verify backups, apply only required reviewed migrations in order, deploy the reviewed commit through the confirmed production provider, compare `/api/build-info` on both devices, then verify cloud save/reload, concurrent-edit rejection, short/long A4 output and the physical calibration sheet. Keep this PR unmerged until production approval. No production changes were made by this work.
