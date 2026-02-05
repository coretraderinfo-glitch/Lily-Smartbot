# 🧠 BRAINSTORM: ARCHIVAL VAULT & DATA RETENTION (PHASE 3)

**Status:** 📝 Saved for Future Implementation (Approved by USER)
**Objective:** Securely store daily PDF reports for a rolling 3-day window to ensure data safety and client auditability.

---

## 🏛️ THE PLAN: THE "ROLLING BLACK BOX" ARCHIVE

### 1. Storage Strategy: Internal Database Vault (Railway)
Instead of adding a third-party account (Supabase), we will leverage the existing `historical_archives` table. This keeps the system "Self-Sustaining" and avoids extra monthly bills or account management.

*   **Logic:** Every time a group uses `结束记录` (End Day), the generated PDF Buffer is converted to a `BYTEA` blob and stored in the database.
*   **Capacity:** 3 Days of history for every active group.

### 2. The "Chronos" Auto-Cleaning Engine
We will implement an automated background task that runs every 24 hours.
*   **Process:** 
    1. Scan `historical_archives`.
    2. Identify entries created > 72 hours ago.
    3. Permanently delete them to keep the database size optimized and fast.

### 3. The "Emergency Recovery" Feature (Owner Only)
We will brainstorm a command: `/recover [GroupID] [Date]`
*   **Security:** Only the **System Owner** (You) can use this.
*   **Function:** If a client accidentally deletes their report or claims it wasn't sent, you can "Re-issue" the PDF from the database vault instantly.

---

## 🚀 RECOMMENDATION: THE "INTERNAL VAULT" PATH

**Why I recommend Railway Internal Storage over Supabase:**
1.  **Speed:** We already have the table in your database. No setup time.
2.  **Privacy:** Your clients' financial data never leaves your private database. It is 100% confidential.
3.  **Simplicity:** One dashboard (Railway) lets you manage everything.
4.  **Cost:** Using your existing Postgres space is essentially free within your current Railway resource limits.

---

## 🛠️ FUTURE IMPLEMENTATION STEPS (WAITING FOR APPROVAL)
1.  **Update `Ledger.stopDay`**: Modify it to return the PDF Buffer and save it to `historical_archives`.
2.  **Enhance `PDFExport`**: Add a local storage helper function.
3.  **Scheduled Task**: Add the "3-Day Purge" logic to `src/core/scheduler.ts`.
4.  **Owner Command**: Create the `/audit_log` command for group recovery.

---
**Saved on:** 2026-02-06 01:52:00
**Priority:** Roadmap - Next Stability Phase
