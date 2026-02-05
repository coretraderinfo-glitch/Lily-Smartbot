# Lily Bot - Complete Command Reference
**For BotFather /setcommands**

---

## 📋 COMMAND LIST (Copy-Paste Format)

```
start - 🚀 开始记录账单 (Start recording)
bill - 📊 显示当前账单 (Show bill)
excel - 📁 导出Excel报表 (Export Excel)
export - 📄 下载PDF对账单 (Download PDF)
operators - 👥 显示操作人列表 (List team)
cleardata - ⚠️ 清理今天数据 (Clear data)
ping - 🛰️ 检查机器人状态 (Health check)
```

---

## 📖 FULL COMMAND DOCUMENTATION

### 🔐 System Commands
| Command | Description | Example |
|---------|-------------|---------|
| `/ping` | Health check - verify bot is online | `/ping` |
| `/generate_key [days]` | Generate license key (Owner only) | `/generate_key 30` |
| `/activate [key]` | Activate bot with license key | `/activate LILY-A1B...` |

---

### 📊 Core Ledger Commands
| Command | Alias | Description |
|---------|-------|-------------|
| `开始` | `/start` | Start daily recording + Daily Slogan |
| `结束记录` | - | End recording & show final summary |
| `+XXX` | - | Record deposit (Auto-Fee calculation) |
| `下发XXX` | - | Record payout (Prefixed with `-`) |
| `下发XXXu` | - | Record USDT payout |
| `回款XXX` | - | Record return transaction (0% Fee) |
| `显示账单` | `/bill` | Show concise "Top 5" ledger |

---

### ✏️ Corrections & Audit
| Command | Alias | Description |
|---------|-------|-------------|
| `入款-XXX` | - | Void/correct deposit |
| `下发-XXX` | - | Void/correct payout |
| `清理今天数据` | `/cleardata` | Clear all today's data (Operator only) |
| `下载报表` | `/export` | **DOWNLOAD PDF** (Professional format) |
| `导出Excel` | `/excel` | Download CSV for internal auditing |

---

### ⚙️ Settings - Fees & Precision
| Command | Description | Example |
|---------|-------------|---------|
| `设置费率X%` | Set inbound fee (Shown as 0.00%) | `设置费率5%` |
| `设置下发费率X%` | Set outbound fee | `设置下发费率2%` |
| `设置为无小数` | Hide decimal places | `设置为无小数` |
| `设置为原始模式` | Show full decimals (Default) | `设置为原始模式` |

---

### 💱 Settings - Multi-Currency (Concurrent)
| Command | Deletion Command | Example |
|---------|------------------|---------|
| `设置美元汇率X` | `删除美元汇率` | `设置美元汇率7.25` |
| `设置马币汇率X` | `删除马币汇率` | `设置马币汇率4.78` |
| `设置比索汇率X` | `删除比索汇率` | `设置比索汇率56.1` |
| `设置泰铢汇率X` | `删除泰铢汇率` | `设置泰铢汇率35.9` |

**Note:** You can set multiple rates! They will all show in the summary concurrently.

---

### 👥 Team Management (RBAC)
| Command | Description | Warning |
|---------|-------------|---------|
| `显示操作人` | `/operators` list | `❌ 您不是操作人...` if unauthorized |
| `设置为操作人` | Promote via Reply | Reply to user: `设置为操作人` |
| `删除操作人` | Demote via Reply | Reply to user: `删除操作人` |

---

## 🚀 QUICK START GUIDE

### 1. Activation & Team
1. Owner sends `/activate [KEY]`.
2. Owner replies to team members with `设置为操作人`.
3. Set your rate: `设置费率2.5%`.

### 2. Standard Operation
1. Type `开始` (Wait for slogan: 🥂 Cheers! Starting a news days).
2. Record money: `+10000`.
3. Record payout: `下发5000`.
4. Audit: `/bill`.
5. Statement: `/export` (Sends PDF).

---

## ⚠️ CRITICAL RULES
- **Mandatory Logic**: Transaction commands will fail if `开始` hasn't been sent.
- **Admin Access**: Group Admins **cannot** use the bot unless promoted to Operator.
- **Precision**: All financial totals are calculated using high-precision `Decimal.js`.
- **4AM Reset**: Chronos Engine auto-resets the ledger at 4 AM every morning.
