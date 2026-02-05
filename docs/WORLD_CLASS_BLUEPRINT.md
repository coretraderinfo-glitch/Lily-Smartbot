# Lily Smartbot - World-Class Engineering Blueprint (v2.0)
**Document Status:** AS-BUILT & FUTURE ROADMAP
**Author:** Antigravity (Advanced Agentic Coding Agent)
**Date:** 2026-02-05

---

## 🏗️ 1. ARCHITECTURE ANATOMY (THE "SYNERGY" MODEL)

The system has evolved from a simple bot into a **Reliability-First Financial Grid**. Every component is anchored in root-cause stability.

### 1.1 Ingress & Command Flow
1.  **Transport**: `grammy.js` handles Telegram Hook events.
2.  **State Gate**: Ingress middleware validates `Group Activation` and `RBAC Authorization` before any logic.
3.  **Queueing**: Commands are serialized into **BullMQ (Redis)**. 
    *   *Root Cause Protection*: This prevents race conditions during concurrent "Show Bill" and "+Deposit" calls.
    *   *Idempotency*: Message IDs are logged to prevent double-counting transaction inputs.

### 1.2 The "Chronos" Engine (Proactive State)
Unlike reactive systems that wait for a user to type, Chronos iterates over every group at 4:00 AM (local time).
- **Proactive Reset**: Automatically sets `current_state` to `WAITING_FOR_START`.
- **Auto-Report**: Generates the final PDF/Excel for the day and posts it to the group, ensuring an audit trail even if the operator forgets.

---

## 💎 2. FINANCIAL ENGINE PRECISION

### 2.1 The "Fixed-Point" Standard
- **Library**: `decimal.js`.
- **Engineering Rule**: No floating-point math allowed.
- **Precision**: 
    *   Storage: `NUMERIC(18, 4)` in PostgreSQL.
    *   Display: `toFixed(2)` for Fiat; `toFixed(4)` for USDT.
    *   Signage: All Payouts (`PAYOUT`) are prepended with `-` in reports to represent negative cash flow.

### 2.2 Multi-Forex Concurrent Processor
The engine now supports simultaneous conversion of the `Net Balance` into `USD`, `MYR`, `PHP`, and `THB`. 
- **Logic**: If a rate is > 0, it is injected into the report template.
- **Conversion Synergy**: `Base CNY -> (Inbound Rate) -> Net CNY -> (Forex Rate) -> Foreign Currency`.

---

## 📈 3. REPORTING & EXPORT (WORLD-CLASS TIER)

### 3.1 PDF Integrity (src/core/pdf.ts)
- **Engine**: `pdfkit-table`.
- **Support**: Embedded `Songti` (Simplified Chinese) font-family to support native business labels.
- **Layout**: 
    1. Branded Header (Lily Smartbot).
    2. Tabular Audit Trail (Transactional Detail).
    3. Summary Block (Color-coded for Payouts/Returns).
    4. Multi-Currency Equivalence.

### 3.2 CSV Export (src/core/excel.ts)
- **Compatibility**: Prepend `\ufeff` (UTF-8 BOM) so Excel opens Chinese characters correctly in all regions (CN/MY/TH).

---

## 🔐 4. SECURITY & RBAC (THE "VAULT")

### 4.1 Strict Tenancy
Every query is anchored with `WHERE group_id = $1`. There is no cross-group data leakage possible.

### 4.2 Promotion-Only RBAC
- **Logic**: Group Admins are **Ignored** by the bot by default.
- **Enrollment**: Only the `OWNER_ID` or an existing `Operator` can promote others via Message-Reply.
- **Visibility**: Unauthorized users receive a specific contact prompt: `❌ 您不是操作人，请联系管理员。`

---

## 🚀 5. FUTURE ROADMAP (THE NEXT TIER)

### 5.1 Real-Time OKX P2P Scraper (Market Engine)
- **Goal**: Auto-fetch USDT buy/sell prices every 5 minutes.
- **Commands**: `lk`, `lz`, `lw`.
- **Synergy**: Allow the ledger to auto-calculate the "Daily USDT Rate" based on real market averages.

### 5.2 S3-Cloud Archiving
- **Goal**: Move PDFs and CSVs to Amazon S3. 
- **Reason**: Currently, files are provided as Data Buffers (Base64). Cloud URLs are better for long-term audit storage and "Infinite History" searches.

### 5.3 Operator Web-Dashboard
- **Goal**: A secure, read-only Next.js dashboard for group owners.
- **Auth**: Telegram Login Widget.
- **Benefit**: Visualize month-over-month growth and payout ratios with Chart.js.

### 5.4 AI-Reconciliation
- **Goal**: Use LLM to reconcile "Human Typo" entries.
- **Example**: If an operator types `下发 100` and then `Void 100`, the AI can suggest a "Clean Ledger" summary.

---

## ✅ 6. AUDIT CHECKLIST (SYNERGY VERIFIED)
- [x] **Chronos Engine**: Handles 4AM rollover proactively.
- [x] **PDF Output**: Localized, professional, and audit-ready.
- [x] **Decimal Precision**: Decimal.js used across all modules.
- [x] **RBAC**: Multi-level protection verified.
- [x] **Naming Convention**: Consistent (e.g., `rate_usd`, `rate_myr`).

---
**END OF BLUEPRINT**
