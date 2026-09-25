<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project Instructions & GitHub Synchronization Workflow

**Repository:** `aliisapilot/dubai-erp`  
**Branch:** `main`

These instructions are persistent project rules for all AI agents and automated sessions working on this repository:

## Task Lifecycle & Synchronization Protocol

1. **Pre-Task Synchronization:**
   - Before starting any task, fetch the latest changes from GitHub and safely synchronize:
     ```powershell
     git fetch origin
     git status
     ```
   - Ensure the current branch is `main` and safely fast-forward (`git pull --ff-only origin main`).
   - If synchronization fails or a merge conflict occurs, **STOP immediately and ask the user**.

2. **Post-Task Verification:**
   - After completing the task implementation, run the application build and relevant lint/test checks:
     ```powershell
     npm run build
     npm run lint
     ```

3. **Error Resolution:**
   - Fix any build errors, type issues, or lint failures introduced by your changes prior to committing.

4. **Security & Credential Review:**
   - Review all modified files and staged diffs (`git diff`).
   - Verify that no API keys, tokens, passwords, `.env` files, Supabase service-role keys, or other credentials are exposed or staged.

5. **Commit:**
   - Commit successful changes with a concise, descriptive commit message explaining the updates.

6. **Push:**
   - When authorized, automatically push changes to GitHub:
     ```powershell
     git push origin main
     ```

7. **Verification & Reporting:**
   - Verify the push completed successfully and report the final commit ID (`git rev-parse HEAD` / `git log -1`) to the user.

## Guardrails
- **NEVER** force-push (`--force` or `--force-with-lease`).
- **NEVER** delete existing work or overwrite another session's changes.
- **NEVER** commit secrets, private tokens, or service-role keys.
- **STOP AND ASK** if synchronization fails, remote branches diverge, or merge conflicts occur.

