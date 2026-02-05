# Phase 2: World-Class Feature Blueprint (The "Diamond" Standard)

**Version:** 2.0 (Draft)
**Status:** PROPOSED (Waiting for User Approval)
**Synergy Target:** High-Precision Financial Ledger & Licensing System

## 1. Executive Summary
This blueprint defines the architecture for "Phase 2" of the Lily Bot. It transitions the system from a basic recorder to a **commercial-grade, secure, and multi-currency financial engine**. Every feature is designed for auditability, precision, and security.

---

## 2. Engineering Architecture & Root Causes

### 2.1 The "Vault" (Licensing & Security)
**Engineering Root Cause:**
The current system allows any group to add the bot. This creates two risks:
1.  **Resource Exhaustion:** Unauthorized groups filling the database.
2.  **Business Leakage:** Unpaid usage of the software.

**The Solution: Cryptographic Activation Keys**
*   **Mechanism:**
    *   **Owner Command:** `/generate_key [duration_days] [max_users]` (Owner Only).
    *   **Algorithm:** AES-256 or Random High-Entropy String (e.g., `LILY-8X92-M4K1-P9L2`).
    *   **Storage:** A new `licenses` table in Postgres.
    *   **Validation:** Middleware checks `groups.license_key` before processing *any* command.
*   **Flow:**
    1.  User adds bot -> Bot says "⚠️ Unlicensed. Please enter key: `/activate [KEY]`".
    2.  User enters key -> Bot validates against DB -> Binds Key to Group ID -> "✅ Activated".
    3.  Key cannot be reused (One-Time Use).

### 2.2 The "Exchange" (Adaptive Rate Engine)
**Engineering Root Cause:**
Financial markets are volatile. Hardcoded rates cause immediate ledger discrepancies. The system requires a "Truth Source" hierarchy.

**The Solution: Two-Layer Rate Hierarchy**
1.  **Layer 1: Manual Override (Authority)**
    *   User commands: `设置美元汇率6.5`, `/gd 6.8`.
    *   **Priority:** HIGH. If set, this overrides automated feeds.
    *   **Storage:** `group_settings` table columns (`rate_usd`, `rate_myr`, etc.).
2.  **Layer 2: Automated Feed (Fallback/Reference)**
    *   **Source:** OKX P2P API (via public endpoints or scraping `lk`, `lz`, `lw`).
    *   **Logic:** Fetches real-time USDT prices for CNY banks, Alipay, WeChat.
    *   **Caching:** Redis (TTL 60 seconds) to prevent API bans.

### 2.3 The "Ledger" (Visual & Multi-Language)
**Engineering Root Cause:**
Financial data is dense. Raw lists are unreadable. "Cognitive Load" must be minimized for accountants.

**The Solution: Template-Based Rendering**
*   **Format:** Strictly adheres to the user's requested layout.
*   **Logic:**
    *   *Inputs:* Valid Transactions for Business Day X.
    *   *Calculation:* `Sum(Deposits) - Sum(Payouts) = Balance`.
    *   *Conversion:* `Balance / Rate_USD = USD_Amount`.
*   **The Artifact (Output):**
    ```text
    入款（3笔）：
     10:44:44  587.76
     ...
    
    下发（0笔）：
    
    总入款：2938.82
    费率：0%
    USD汇率：3.9
    应下发：2938.82｜753.54 USD
    总下发：0｜0 USD
    余：2938.82｜753.54 USD
    ```

---

## 3. Comprehensive Command Reference (The "Commander")

This section maps user intent to engineering implementation logic.

### 3.1 Core Operations
| User Command | Logic | Engineering Note |
| :--- | :--- | :--- |
| `开始` | Start Daily Ledger | Checks License -> Sets `groups.status = RECORDING`. |
| `结束记录` | Stop Daily Ledger | Sets `groups.status = PAUSED` -> Generates Final Bill. |
| `+XXX` | Deposit (CNY) | `INSERT INTO transactions (type='DEPOSIT', amount=XXX, currency='CNY')`. |
| `入款-XXX` | Correction (Void) | `INSERT INTO transactions (type='DEPOSIT', amount=-XXX)` (Contra-entry). |
| `下发XXX` | Payout (CNY) | `INSERT INTO transactions (type='PAYOUT', amount=XXX)`. |
| `下发XXXu` | Payout (USDT) | `INSERT INTO transactions (type='PAYOUT', amount=XXX, currency='USDT')`. |
| `回款XXX` | Return (Credit) | `INSERT INTO transactions (type='RETURN', amount=XXX)`. |
| `显示账单` | Show Daily Summary | Queries TB -> Aggregates -> Renders Template (Last 5 txns + Totals). |
| `显示完整账单` | Web View Link | Generates JWT Token -> Returns URL `https://.../bill/[token]`. |

### 3.2 Configuration (Persistent Settings)
| User Command | Logic | DB Field |
| :--- | :--- | :--- |
| `设置费率X%` | Set Inbound Fee | `group_settings.rate_in` |
| `设置下发费率X%` | Set Outbound Fee | `group_settings.rate_out` |
| `设置美元汇率X` | Manual USD Rate | `group_settings.rate_forex_usd` |
| `/gd X` | Fixed Rate Alias | Alias for above. |
| `设置操作人 @User` | RBAC Addition | `INSERT INTO group_operators`. |
| `删除操作人 @User` | RBAC Removal | `DELETE FROM group_operators`. |

### 3.3 USDT & Tools (The "Toolkit")
| User Command | Logic |
| :--- | :--- |
| `lk` | `Fetch(OKX_Bank)` -> Return Price. |
| `lz` | `Fetch(OKX_Alipay)` -> Return Price. |
| `lw` | `Fetch(OKX_WeChat)` -> Return Price. |
| `k100` | `100 / Fetch(OKX_Bank)` -> Return USDT amount. |

---

## 4. File & Folder Structure (Architecture)

To ensure "Strong Planning", we will refactor the codebase into this clean Domain-Driven Design (DDD) layout:

```text
src/
├── bot/                 # Telegram Interface Layer
│   ├── commands/        # Command Handlers (Split by feature)
│   │   ├── ledger.ts    # (+XXX, Show Bill)
│   │   ├── admin.ts     # (Settings, License)
│   │   └── tools.ts     # (USDT, Calc)
│   ├── index.ts         # Main Listener (Dispatcher)
│   └── middleware/      # Auth & License Checks
├── core/                # Business Logic (The "Brain")
│   ├── ledger.ts        # Accounting Math (Decimal.js)
│   ├── licensing.ts     # Key Generation & Validation
│   └── exchange.ts      # Rate Fetching & Conversion
├── db/                  # Persistence Layer
│   ├── schema.sql       # Updated Schema
│   └── repo/            # Data Access Objects (Helpers)
├── utils/               # Shared Utilities
│   ├── formatter.ts     # The Bill Template Engine
│   └── time.ts          # Business Day Logic
└── worker/              # Queue Processor
```

---

## 5. Implementation Roadmap

1.  **Refactor**: Create the folder structure above.
2.  **Schema Update**: Add `licenses` table and `rate_` columns to settings.
3.  **License System**: Implement `generate_key` and middleware.
4.  **Forex Engine**: Implement `exchange.ts` (OKX fetcher).
5.  **Ledger Engine**: Update `formatter.ts` to match the exact "Chinese Format".
6.  **Testing**: Verify `Start` -> `+100` -> `Show Bill` flow exactly matches the screenshot requirement.

---

**Waiting for Approval:** Does this Blueprint meet the "World-Class" standard you expect?
