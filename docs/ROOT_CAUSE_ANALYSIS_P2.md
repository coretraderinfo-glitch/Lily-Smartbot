# Root Cause Analysis: Phase 2 Stability & Security

## 1. Issue: Variable Business Date Allocation
**Symptoms:** Transactions recorded between 00:00 and 04:00 might appear on the "wrong day" in reports, or inconsistent balances between the live bill and exported statements after a reset.
**Root Cause:** The `getBusinessDate` utility used a hardcoded `SYSTEM_ResetHour = 4`, while the `groups` table allowed configurable `reset_hour`. Mismatched logic caused accounting drifts.
**Fix:** Refactored `getBusinessDate` to accept a dynamic `resetHour` parameter. Synchronized all 6 call sites in `ledger.ts`, `pdf.ts`, and `excel.ts` to fetch the reset hour from the database.

## 2. Issue: Security Loophole (RBAC Bypass)
**Symptoms:** Users claimed "others are still able to control the bot" despite RBAC being active.
**Root Cause:** 
1. The `isCommand` whitelist in `bot/index.ts` was incomplete, missing several keyword-based commands.
2. The RBAC bootstrap logic was too permissive; if no operators were added yet, the system allowed *anyone* to trigger a command, effectively letting any user become the first operator.
**Fix:** 
1. Implemented a strict Regex-based `isCommand` filter with a mandatory slash-command catch-all.
2. Modified RBAC bootstrapping to require **Telegram Group Administrator** status or `OWNER_ID` match for the first operator setup. Added a `try-catch` protected `getChatMember` call.

## 3. Issue: Invisible Background Failures
**Symptoms:** Commands sometimes "did nothing" without feedback, leading to user confusion and perceived "errors".
**Root Cause:** The BullMQ worker handled failures silently or only logged them to the server console. Users had no visibility into database timeouts or PDF generation errors.
**Fix:** Implemented a global `worker.on('failed')` handler in `bot/index.ts` that pushes a "Root Cause Identified" notification back to the Telegram group with the specific error message.

## 5. Issue: PDF Generation Failure (Font ENOENT)
**Symptoms:** `System Error: ENOENT: no such file or directory, open '/System/Library/Fonts/Supplemental/Songti.ttc'`.
**Root Cause:** Hardcoded font path only worked on standard macOS environments. In Docker or Linux environments, the path was invalid, causing `pdfkit` to crash.
**Fix:** 
1. Bundled a universal Chinese-compatible font (`ArialUnicode.ttf`) into the project under `assets/fonts/`.
2. Implemented a robust multi-path font discovery loop that checks the bundled font first, then common system paths for both macOS and Linux.
3. Added a graceful fallback to standard PDF fonts to prevent process termination.
