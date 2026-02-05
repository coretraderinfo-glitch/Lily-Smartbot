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

### Phase 1: Foundation & Ledger Core
1.  **Scaffold**: Init Node.js repo, TypeScript, ESLint, Prettier.
2.  **Infra**: Setup Docker Compose (Postgres, Redis).
3.  **Schema**: Create Migration 001 (Groups, Settings, Transactions) per `02_ARCHITECTURE`.
4.  **Ingress**: Basic Telegram Bot Hook -> Queue Producer.
5.  **Worker (Commands)**: Implement `Start`, `Rate`, `Clear` state logic.
6.  **Worker (Transactions)**: Implement `+XXX`, `下发`, `Void` with correct Fee logic.
7.  **Test**: Unit tests for Fee Calculation and Daily Boundary logic.

### Phase 2: Reporting & Visualization
1.  **Bill Renderer**: Implement "Text Bill" generator (Modes 1-4).
2.  **Cache Strategy**: Implement Redis caching for `RunningTotal` to speed up reads.
3.  **Web View**: Create simple Express route `/bill/:uuid` to render full Day Ledger (HTML/CSS).

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
