# Lily Bot - UX & Command Reference Blueprint (v2.1)

## 1. Interaction Philosophy
**Speed is King**. Financial operators work fast.
*   **Minimal Keystrokes**: `+1000` over `/add 1000`.
*   **Concise Feedback**: Only show the latest 5 transactions in the bill to reduce screen scroll (Cognitive Load).
*   **Structural Clarity**: All payouts are shown with a `-` sign to immediately communicate balance deduction.

---

## 2. Comprehensive Command Dictionary

### 2.1 Group Setup & State
| Trigger (CN) | Slash Alias | Action | Logic |
| :--- | :--- | :--- | :--- |
| `开始` | `/start` | Activate Day | Sets state to `RECORDING` + 🥂 Slogan. |
| `结束记录` | `/stop` | Freeze Day | Disables further edits. |
| `清理今天数据` | `/cleardata` | Wipe Day | Destructive hard delete of current day. |
| `显示操作人` | `/operators` | List Team | Verified RBAC checks. |

### 2.2 Transaction Recording (Operator Only)
| Structure | Type | Meaning | Fee |
| :--- | :--- | :--- | :--- |
| `+1000` | DEPOSIT | Money in | Auto-fee reduction. |
| `下发500` | PAYOUT | Money out | Prefixed with `-`. |
| `下发500u`| PAYOUT | USDT out | Prefixed with `-`. |
| `回款200` | RETURN | Money back | 0% Default fee. |
| `入款-100` | CORRECTION| Void deposit| Contra-entry. |

### 2.3 Reporting & Audit
| Command | Result | Synergies |
| :--- | :--- | :--- |
| `显示账单` | /bill | Concise "Top 5" visual ledger. |
| `下载报表` | /export | Professional **PDF** Statement (Bilingual). |
| `导出Excel` | /excel | UTF-8 **CSV** Data dump. |

---

## 3. Localization & Forex
Concurrent display of the following exchange rates (if set > 0):
- **USD Rate** (`设置美元汇率`)
- **MYR Rate** (`设置马币汇率`)
- **PHP Rate** (`设置比索汇率`)
- **THB Rate** (`设置泰铢汇率`)

**Deletion Logic**: Use `删除[币种]汇率` (e.g., `删除比索汇率`) to hide a currency from reports.

---

## 4. World-Class UX Refinements

### 4.1 Proactive Reporting (Chronos)
At 4:00 AM, the bot automatically sends a "Final Day Report" with the PDF attached. This eliminates the "Forgot to Close" human error root cause.

### 4.2 Security Gating
If a non-operator attempts a command, the bot replies with a firm but polite rejection:
> ❌ 您不是操作人，请联系管理员。

### 4.3 2-Decimal Standard
All rates (e.g., `2.50%`) and balances (e.g., `100.00`) are strictly formatted to two decimal places for professional accounting appearance.

---
**Status**: 100% Synced with Production Code.
