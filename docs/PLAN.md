# docs/PLAN.md
**Status:** APPROVED
**Plan Version:** 1.0
**Product Type:** Telegram Bot (Financial Ledger)
**Sensitive Data:** YES (Financial Transactions)
**Architecture:** Event-Driven (Node.js + BullMQ + PostgreSQL + Redis)

## 1) Core Objective
Build "Lily", a high-precision, multi-currency financial ledger bot for Telegram groups. It allows teams to track daily Inbound (Deposits) and Outbound (Payouts) transactions with strict accounting cycles (4 AM - 4 AM) and real-time USDT P2P pricing tools.

## 2) Success Criteria (Testable)
1.  **Ledger Integrity**: `Total In - Total Out` must exactly match `Net Balance` across all test scenarios (including concurrent writes).
2.  **State Machine**: Transactions MUST be rejected if the daily session is not `Start`-ed.
3.  **Accuracy**: Fees calculated to 4 decimal places; no floating point errors.
4.  **Performance**: "Show Bill" response < 200ms (via Redis cache).
5.  **USDT Tool**: `k100` returns a valid calculation based on OKX data < 2s.

## 3) Architecture Guidelines
*   **Repo Structure**: `src/bot` (Ingress), `src/worker` (Logic), `src/web` (Bill View).
*   **Database**: PostgreSQL 16+ (Strict Schemas).
*   **Queue**: BullMQ (Redis) for all command processing throughout.
*   **Config**: `GroupSettings` JSONB for flexibility.

## 4) Implementation Steps (Phased Execution)

### Phase 1: Core Foundation (✅ DONE)
- [x] **Project Setup**: TypeScript, Node.js, ESLint, Prettier.
- [x] **Database**: PostgreSQL Schema (Groups, Settings, Transactions).
- [x] **Queue System**: BullMQ + Redis for async processing.
- [x] **Bot Ingress**: Grammy.js listener + Basic Command Parsing.
- [x] **Deployment**: Dockerfile + Railway Config (Fixed & Live).
- [x] **Diagnostics**: /ping, Debug Logging, Webhook Auto-Reset.

## Phase 2: World-Class Features (🚧 IN PROGRESS)
**Reference:** `docs/brainstorming/PHASE_2_BLUEPRINT.md` (Approved 2026-02-05)

### 2.1 Architecture Refactor (The "Strong Foundation")
- [ ] **Folder Structure**: Move to Domain-Driven Design (`src/core`, `src/bot/commands`).
- [ ] **Dispatcher**: dedicated command router instead of giant `if/else`.

### 2.2 Security & Licensing (The "Vault")
- [ ] **Schema Update**: Add `licenses` table.
- [ ] **Owner Commands**: `/generate_key [days]`.
- [ ] **User Commands**: `/activate [key]`.
- [ ] **Middleware**: Block unauthorized groups.

### 2.3 The "Exchange" Engine (USDT/Forex)
- [ ] **Schema Update**: Add `rate_usd`, `rate_myr` etc. to `group_settings`.
- [ ] **Manual Commands**: `设置美元汇率`, `/gd`.
- [ ] **P2P Fetcher**: Scraper/API for OKX (`lk`, `lz`, `lw`).
- [ ] **Calculator**: `k100` logic.

### 2.4 The "Ledger" Engine (Visual Excellence)
- [ ] **Formatter**: Implement exact text template from User Request.
- [ ] **Logic**: `sum(in) - sum(out)` calculations with `Decimal.js` precision.
- [ ] **Commands**: `+XXX`, `下发XXX`, `入款-XXX` (Correction).

### 2.5 Access Control (RBAC)
- [ ] **Operator Management**: `设置操作人`, `删除操作人`.
- [ ] **Permission Middleware**: Only Owners/Operators can write to ledger.

### Phase 3: USDT & Advanced Tools
1.  **Market Engine**: Implement OKX P2P Scraper (Puppeteer or API).
2.  **Rate Utils**: Implement `lk`, `lz`, `k100` calculators.
3.  **Multi-Currency**: Ensure separate counting for `XXXu` (USDT) vs Fiat.

### Phase 4: Production Hardenining
1.  **Validation**: Rate limiter, Input sanitization.
2.  **Ops UX**: `@mention` button helpers.
3.  **Deployment**: Dockerfile optimization.

## 5) Security Baseline
*   **Auth**: Only `Owner` or `Admin` can set Rates/Clear Data.
*   **Audit**: All sensitive commands logged to `audit_logs`.
*   **Isolation**: Queries MUST always include `WHERE group_id = ?`.

## 6) Open Questions
*   None. Brainstorming Phase handled all logic gaps.

## 7) Definition of Done
*   All commands from `04_UX` are functional.
*   "Show Bill" matches manual calculation.
*   Bot handles 4AM rollover correctly (Wait for Start).
