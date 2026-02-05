# Lily Bot - Complete Command Reference
**For BotFather /setcommands**

---

## 📋 COMMAND LIST (Copy-Paste Format)

```
ping - 🏓 Health check
generate_key - 🔑 Generate license key (Owner only)
activate - ✅ Activate bot with license key
gd - 💱 Set USD exchange rate (alias)
```

---

## 📖 FULL COMMAND DOCUMENTATION

### 🔐 System Commands
| Command | Description | Example |
|---------|-------------|---------|
| `/ping` | Health check - verify bot is online | `/ping` |
| `/generate_key [days] [users]` | Generate license key (Owner only) | `/generate_key 30 100` |
| `/activate [key]` | Activate bot with license key | `/activate LILY-A1B2C3D4` |

---

### 📊 Core Ledger Commands
| Command | Description | Example |
|---------|-------------|---------|
| `开始` | Start daily recording | `开始` |
| `结束记录` | End recording & show final bill | `结束记录` |
| `+XXX` | Record deposit | `+1000` or `+587.76` |
| `下发XXX` | Record payout (CNY) | `下发500` |
| `下发XXXu` | Record payout (USDT) | `下发100u` |
| `回款XXX` | Record return transaction | `回款200` |
| `显示账单` | Show current bill | `显示账单` |

---

### ✏️ Corrections
| Command | Description | Example |
|---------|-------------|---------|
| `入款-XXX` | Void/correct deposit | `入款-100` |
| `下发-XXX` | Void/correct payout | `下发-50` |
| `清理今天数据` | Clear all today's data (⚠️ destructive) | `清理今天数据` |

---

### ⚙️ Settings - Fees
| Command | Description | Example |
|---------|-------------|---------|
| `设置费率X%` | Set inbound fee rate | `设置费率5%` or `设置费率5.5%` |
| `设置下发费率X%` | Set outbound fee rate | `设置下发费率2%` |

---

### 💱 Settings - Exchange Rates
| Command | Description | Example |
|---------|-------------|---------|
| `设置美元汇率X` | Set USD exchange rate | `设置美元汇率7.2` |
| `/gd X` | Set USD rate (alias) | `/gd 7.3` |
| `设置比索汇率X` | Set PHP exchange rate | `设置比索汇率56` |
| `设置马币汇率X` | Set MYR exchange rate | `设置马币汇率4.8` |
| `设置泰铢汇率X` | Set THB exchange rate | `设置泰铢汇率36` |

**Note:** Set rate to `0` to hide that currency from bills.

---

### 🎨 Settings - Display Options
| Command | Description | Result |
|---------|-------------|--------|
| `设置显示模式2` | Show top 3 transactions | Compact view |
| `设置显示模式3` | Show top 1 transaction | Minimal view |
| `设置显示模式4` | Summary only | Total In/Out/Balance |
| `设置为计数模式` | Count mode | Numbered list with total |
| `设置为原始模式` | Reset to default | Full detail with decimals |
| `设置为无小数` | Hide decimal places | Round all amounts |

---

### 👥 Team Management (RBAC)
| Command | Description | Example |
|---------|-------------|---------|
| `显示操作人` | List all authorized operators | `显示操作人` |
| `设置操作人 @user` | Add operator (use reply method) | Reply to user's message: `设置为操作人` |
| `删除操作人 @user` | Remove operator (use reply method) | Reply to user's message: `删除操作人` |

**Best Practice:** Reply to a user's message and send `设置为操作人` to add them as an operator.

---

## 🚀 QUICK START GUIDE

### 1. First Time Setup
```
/activate LILY-XXXX-XXXX-XXXX
设置费率5%
设置美元汇率7.2
开始
```

### 2. Daily Workflow
```
开始
+1000
+500
下发300
显示账单
结束记录
```

### 3. Fix Mistakes
```
入款-100    (if you entered +100 by mistake)
下发-50     (if you entered 下发50 by mistake)
```

### 4. Customize Display
```
设置显示模式4    (summary only)
设置为无小数      (hide decimals)
显示账单
设置为原始模式    (reset to default)
```

---

## 📱 BotFather Setup

To add commands to your bot's menu in Telegram:

1. Open [@BotFather](https://t.me/BotFather)
2. Send `/setcommands`
3. Select your bot
4. Copy-paste this:

```
ping - 🏓 Health check
generate_key - 🔑 Generate license key
activate - ✅ Activate with license
gd - 💱 Set USD rate
```

**Note:** Chinese commands cannot be added to BotFather menu, but they work perfectly when typed directly in chat.

---

## 💡 TIPS

1. **Decimals Supported**: `+587.76` works perfectly
2. **USDT Suffix**: Use `下发100u` for USDT payouts
3. **Rates Update Instantly**: No need to restart after changing settings
4. **Display Modes**: Try different modes to find what works best for your team
5. **Corrections**: Use `入款-XXX` instead of manually calculating negatives

---

## ⚠️ IMPORTANT NOTES

- **License Required**: Bot will not work without activation
- **Daily Start**: Must send `开始` each day before recording transactions
- **Clear Data**: `清理今天数据` is permanent - use with caution
- **Timezone**: Default is Asia/Shanghai (4 AM reset)
