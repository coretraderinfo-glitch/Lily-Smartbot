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

## Phase 2: World-Class Features (✅ 100% COMPLETE)
**Reference:** `docs/brainstorming/PHASE_2_BLUEPRINT.md` (Approved 2026-02-05)

### 2.1 Architecture Refactor (The "Strong Foundation")
- [x] **Folder Structure**: Move to Domain-Driven Design (`src/core`, `src/bot`, `src/db`).
- [x] **Dispatcher**: Standardized command queuing and RBAC middleware.

### 2.2 Security & Licensing (The "Vault")
- [x] **Schema Update**: Added `licenses` table and activation logic.
- [x] **Owner Commands**: `/generate_key` (strict owner-only).
- [x] **User Commands**: `/activate` with expiry validation.
- [x] **Middleware**: Secure ingress blocking unauthorized access.

### 2.3 The "Exchange" Engine (Forex/Display)
- [x] **Multi-Forex**: Concurrent support for USD, MYR, PHP, THB.
- [x] **Manual Commands**: `设置...汇率` and `删除...汇率`.
- [x] **Display Mode**: Ultra-concise "Top 5" logic for mobile readability.

### 2.4 The "Ledger" Engine (Financial Excellence)
- [x] **Formatter**: Professional bill summary with dual-currency audit.
- [x] **Returns**: Semantic `回款` support with balance integration.
- [x] **Structural Clarity**: Prepend `-` to all payout amounts.

### 2.5 Access Control (RBAC)
- [x] **Operator Management**: `设置为操作人`, `删除操作人` via reply.
- [x] **Strict Protection**: Admins blocked unless authorized; contact admin prompt.

### 2.6 The "Chronos" & "Report" Engines
- [x] **Auto-Rollover**: Chronos Engine for proactive 4AM reset and reporting.
- [x] **PDF Professional**: World-class PDF statements with localized Chinese support.

## Phase 3: USDT & Advanced Tools (🚧 IN PROGRESS)
1.  **Market Engine**: Implement OKX P2P Scraper (Puppeteer or API).
2.  **Rate Utils**: Implement `lk`, `lz`, `k100` calculators.
3.  **Cross-Ledger**: Dedicated USDT tracking vs. Fiat conversions.

## Phase 4: Production Hardening & Global Scale
1.  **Validation**: Rate limiter, Anti-spam.
2.  **S3 Storage**: Move PDF/Excel files to cloud storage for scale.
3.  **Dash**: Web-based audit dashboard for operators.

## 5) Security Baseline
*   **Auth**: Only `Owner` or `Admin` can set Rates/Clear Data.
*   **RBAC**: Commands ignored for non-operators to prevent noise.
*   **Isolation**: Queries strictly partitioned by `group_id`.

## 6) Open Questions
*   None. System in high-stability recording phase.

## 7) Definition of Done
*   [x] 4 AM Auto-Rollover verified functional.
*   [x] PDF Exports render correct Chinese characters.
*   [x] All Payouts prefixed with `-` and formatted to 2 decimals.
*   [x] Unauthorized users see "Contact Admin" prompt.
