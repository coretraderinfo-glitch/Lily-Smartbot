# Lily Bot - Core Commands & Logic Blueprint

## 1. System Initialization & Scope
**Concept**: The bot operates on a "per-group" tenancy model. Each group is an isolated ledger.

### 1.1 Bot Activation
*   **Trigger**: Bot added to group.
*   **Command**: `Start` (or Chinese `开始`)
*   **Logic**:
    *   Bot checks permissions (Admin only).
    *   Initializes the "Daily Ledger" for the current Group ID.
    *   **CRITICAL RULE**: The ledger operations depend on the **Group State**.
    *   **State Machine**:
        1.  **4:00 AM Auto-Reset**: Chronos Engine proactively transitions state to `WAIT_FOR_START`.
        2.  **User Input `开始`**: System transitions to `RECORDING` and replies with: `🥂 Cheers! Starting a news days.`
        3.  **Transactions**: Only accepted when state is `RECORDING`. If sent in `WAIT_FOR_START` or `ENDED`, bot replies with an activation warning.
        4.  **User Input `结束记录`**: System transitions to `ENDED` and generates the final PDF statement.
    *   *Engineering Constraint*: Times are stored in UTC. Business Day calculation: `DateTime.now().setZone(timezone).minus({ hours: 4 }).toFormat('yyyy-MM-dd')`.

### 1.2 Rate Management
*   **Input**: `设置费率X.X%` (Set inbound rate)
*   **Input**: `设置下发费率x%` (Set payout rate)
*   **Logic**:
    *   Rates are persisted in the `GroupSettings` table.
    *   **Precision**: stored as `Decimal(10, 4)` to prevent floating point errors.
    *   **Effective Date**: Rate changes apply immediately to *subsequent* transactions? Or retroactive for the day?
    *   *Refined Rule*: Changes apply to *future* transactions by default to verify ledger integrity. If retroactive is needed, a separate "Recalculate Day" command is safer.

---

## 2. Transaction Processing ( The Core Loop)

### 2.1 Deposits (Inbound)
*   **Command**: `+XXX` (e.g., `+1000`, `+5000.50`)
*   **Behavior**:
    1.  Parse numeric value `XXX`.
    2.  Validate positive number.
    3.  Calculate `Fee = Amount * LimitRate`.
    4.  Calculate `Net = Amount - Fee`.
    5.  Insert record into `Transactions` table:
        *   `Type`: 'DEPOSIT'
        *   `Amount`: 1000
        *   `Fee`: (Calculated)
        *   `Operator`: (Telegram User ID of sender)
        *   `Timestamp`: NOW()
        *   `BusinessDate`: (Calculated based on 4AM rule)
    6.  **Reply**: Concise receipt message (configurable format).

### 2.2 Payouts (Outbound)
*   **Command**: `下发XXX` (Fiat Payout) | `下发XXXu` (USDT Payout)
*   **Logic**:
    *   Distinguish currency based on suffix 'u'.
    *   If 'u' (USDT):
        *   Check `USDT Rate` (Exchange Rate).
        *   Convert to Fiat equivalent for ledger balancing? Or keep separate USDT ledger?
        *   *Blueprint Decision*: Dual-Ledger System. The bot tracks both "Fiat Balance" and "USDT Balance".
    *   Fees: Apply `Payout Rate` if configured.
    *   Deduct from Group Balance.

### 2.3 Repayments / Returns
*   **Command**: `回款xxx`
*   **Logic**:
    *   Treated as a credit to the system, similar to Deposit but semantically distinct (maybe no fee applied?).
    *   *Clarification Needed*: Does "Return" incur the standard inbound fee? Usually, "Repayment" (回款) implies 0% fee internal transfer or clearing using the `Set Rate`?
        *   *Recommendation*: Configurable "Repayment Fee" (default 0%).

### 2.4 Corrections & Voids
*   **Command**: `入款-XXX` | `下发-XXX`
*   **Logic**:
    *   **Negative Entry Pattern**: Instead of deleting records (which breaks audit trails), we insert a **Contra-Entry**.
    *   Example: User entered `+1000` by mistake.
    *   Correction: `入款-1000`.
    *   System records a transaction of `Amount: -1000`.
    *   Net effect on sum is 0.
    *   Audit log shows: `+1000` followed by `-1000`.

---

## 3. Personnel & Access Control

### 3.1 Operator Management (The "Console" Concept)
*   **Command**: `设置操作人 @user` | `删除操作人 @user`
*   **Mechanism**:
    *   Role-Based Access Control (RBAC).
    *   **Roles**:
        *   `Owner` (Group Creator): Can do everything.
        *   `Admin` (Promoted by Owner): Can set rates, clear data.
        *   `Operator` (The "Op"): Can record entries (`+XXX`, `下发`).
        *   `Viewer`: Can only see bills (optional).
*   **UX Enhancement**:
    *   "Start typing @..." trigger logic is native Telegram client behavior, but the bot can prompt it.
    *   Reply-to-set: Reply "Set as Operator" to a message to promote that user.

---

## 4. Reporting & Visualization

### 4.1 "The Bill" (Inline Ledger)
*   **Command**: `显示账单` (Show Bill)
*   **Logic**:
    *   Fetch latest 5 transactions for the current *Business Day*.
    *   Calculate Day's Totals:
        *   `Total In`: Sum(Deposits).
        *   `Total Out`: Sum(Payouts).
        *   `Net Balance`: In - Out.
    *   Render specific format (see Display Modes).

### 4.2 Display Modes (Templates)
The user described multiple modes. These are essentially **View Templates**.
*   `Mode 1 (Default)`: Full details + decimals.
*   `Mode 2`: Show last 3 rows.
*   `Mode 3`: Show last 1 row.
*   `Mode 4`: Summary only (Total In/Out).
*   `No Decimals`: `Round(Amount, 0)`.
*   `Count Mode`: Simplified, minimal text.
*   `Original`: Raw dump.

### 4.3 Full Bill (The Web View)
*   **Command**: `显示完整账单`
*   **Mechanism**:
    *   Telegram messages have character limits (4096 chars). A full day's ledger often exceeds this.
    *   **Solution**: Generate a **Secure Temporary Link** (Magic Link).
    *   **Technical**:
        1.  Generate UUID.
        2.  Store `(UUID, GroupID, BusinessDate, ExpireTime)` in Redis/DB.
        3.  Return URL: `https://lily-bot.com/bill/{UUID}`.
    *   **Web Page**: A beautiful, responsive specific page rendering the full table, exportable to Excel/PDF.

---

## 5. Currency & Forex Engine

### 5.1 Manual Rates
*   **Commands**: `设置美元汇率`, `设置比索汇率`, `设置马币汇率`, `设置泰铢汇率`.
*   **Logic**:
    *   Store `ExchangeRates` dictionary in Group Config.
    *   If Rate > 0, the Currency Column appears in the "Show Bill" output.
    *   If Rate == 0, hide that currency.

### 5.2 USDT Pricing Module (Independent Function)
*   **Feature**: Real-time checking of P2P prices (OKX/Binance).
*   **Commands**:
    *   `lk` (List Card): Get OKX P2P Buy orders filtering for "Bank Card".
    *   `lz` (List Alipay): Filter for "Alipay".
    *   `lw` (List WeChat): Filter for "WeChat Pay".
    *   `k100` / `z100` / `w100`: Calculator.
        *   Logic: Input 100 CNY -> Output USDT amount based on *best current* average price.
*   **Implementation**:
    *   Background Job / Cron: Scrape or API call to OKX P2P Public Data every 60 seconds (or on demand with cache).
    *   Storage: `MarketPrice` table (Currency, Method, Price, Timestamp).

---

## 6. End of Day
*   **Command**: `结束记录` (End Record) | `清理今天数据` (Clear Day).
*   **Logic**:
    *   `End Record`: Freezes the current Business Day. No more edits allowed.
    *   `Clear Data`: **Dangerous**. Hard delete or Soft delete?
    *   *Safety Feature*: Require confirmation (Bot sends "Are you sure?" button).

