# Lily Bot - UX & Command Reference Blueprint

## 1. Interaction Philosophy
**Speed is King**. Financial operators work fast.
*   **Minimal Keystrokes**: `+1000` is better than `/add 1000`.
*   **Smart Parsing**: Handle logic like "Start 1000" or "+ 1000" (spaces) gracefully.
*   **Feedback Loop**: Every action must have an immediate ✅ or ❌ reaction.

---

## 2. Comprehensive Command Dictionary

### 2.1 Group Setup (Admin)
| Trigger (CN) | Trigger (EN) | Action | Notes |
| :--- | :--- | :--- | :--- |
| `开始` | `Start` | Init Day | **Must run daily** (or auto-schedule) |
| `结束记录` | `End` | Freeze Day | prevents further edits |
| `清理今天数据` | `Clear` | Wipe Day | Requires "Are you sure?" confirmation |
| `设置费率5%` | `Set Rate 5%` | Inbound Fee | Updates config immediately |
| `设置下发费率2%` | `Set Out Rate` | Outbound Fee | |
| `设置操作人 @x` | `Add Op @x` | Grant Access | Can also Reply "设置为操作人" |
| `删除操作人 @x` | `Del Op @x` | Revoke Access | |

### 2.2 Transaction Recording (Operator)
| Trigger | Structure | Meaning | Fee Logic |
| :--- | :--- | :--- | :--- |
| `+` | `+1000` | Deposit 1000 | Applies `Inbound Fee` |
| `取` / `下发` | `下发500` | Payout 500 Fiat | Applies `Outbound Fee` |
| `u` | `下发500u` | Payout 500 USDT | Custom logic (Dual ledger?) |
| `回` | `回款200` | Return 200 | Usually 0% fee |
| `入款-` | `入款-100` | Correction | Negates previous entry |

### 2.3 Reporting (Everyone/Ops)
| Trigger | Action | UX Details |
| :--- | :--- | :--- |
| `显示账单` | Show Today's Bill | Renders based on `DisplayMode` |
| `显示完整账单` | Generate Web Link | Returns `[ 🔗 Click to View Full Report ](url)` |
| `显示操作人` | List Team | Shows Owner, Admins, Ops |

### 2.4 Visualization Modes (Config)
User command: `设置显示模式X`
*   **Mode 1 (Detailed)**:
    ```text
    📅 2026-02-05 (Running)
    
    1. 10:05 | +1000 | @Robin
    2. 10:10 | -500  | @Lily
    ...
    
    💰 In: 5000 | 📤 Out: 2000
    💎 Net: 3000
    ```
*   **Mode 4 (Summary)**:
    ```text
    📅 Ledger Update
    Total In: 5000
    Total Out: 2000
    ```
*   **Mode Count (计数模式)**:
    ```text
    1. +1000
    2. +500
    3. -200
    Total: 1300
    ```

### 2.5 Market Tools (Public/User)
*   `显示USDT价格`: Toggles the ticker on/off in the Bill header.
*   `lk` / `lz` / `lw`: Returns the "Quote Card" (as defined in Doc 03).

---

## 3. World-Class UX Enhancements

### 3.1 Smart Error Handling
Don't just say "Error".
*   **Bad**: `Invalid command.`
*   **Good**: `⚠️ Did you mean "+1000"? I didn't understand "++1000".`

### 3.2 The "Undo" Button
*   When a transaction is recorded, the bot replies:
    > ✅ Recorded +1000. (Net: 980)
    > [ 🔙 Undo ] (Inline Button)
*   Clicking **Undo** immediately triggers the `Void` logic for that specific Transaction ID without typing `入款-1000`.

### 3.3 Auto-Completion for "Operator"
*   Command: `/ops`
*   Bot returns a list of buttons:
    > Select user to Promote:
    > [ @Tom ] [ @Jerry ] [ @Spike ]
*   Clicking handles the ID retrieval automatically (No more typing usernames manually).

### 3.4 Multi-Language Support (i18n)
*   The system should process logic in English internally but render strings based on Group Language Setting (`CN` / `EN`).
*   The Chinese commands provided are just aliases for the core logic.

### 3.5 PDF Export
*   In the "Full Bill" web view, add a "Download PDF" button.
*   Generates a branded, formal financial statement suitable for sending to bosses/finance departments.

