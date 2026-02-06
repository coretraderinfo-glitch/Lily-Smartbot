# 🧠 BRAINSTORM: DYNAMIC FEATURE MENU SYSTEM (PHASE 4)

**Status:** 📝 Saved for Discussion (Brainstorm Mode)
**Objective:** Replace the text-heavy `/help` with a sleek, organized button-based menu system that scales with the bot's growth.

---

## 🎨 THE MENU ARCHITECTURE

### 1. Main Menu (The Hub)
When a user triggers `/menu`, `/help`, or clicking the Menu Button, they see:

```
🌟 Lily Smart Ledger - 仪表盘 (Dashboard)

欢迎使用专业级账本管理系统。请选择功能模块：
Welcome to the professional ledger system. Select a module:

[ 📊 计算系统 (Calculation) ]
[ 🛡️ 守护者系统 (Guardian) ]
```

---

### 2. Feature 1: Calculation (The "Calc" Engine)
Clicking the `[ 📊 计算系统 (Calculation) ]` button opens the sub-dashboard:

**Commands supported in this view:**
*   **Recording:** `开始 (Start)` | `结束记录 (Stop)`
*   **Balance:** `显示账单 (View Bill)`
*   **Reports:** `下载报表 (Get PDF)` | `导出Excel`
*   **Data Audit:** `纠错 (Correction)`
*   **Data Reset:** `清理今天数据 (Wipe Today)`

**Layout Concept:**
```
📊 计算系统 (Calculation Engine)

操作指南 (Operations):
• 输入 +1000： 记录入款 (Deposit)
• 输入 -500： 记录下发 (Payout)
• 输入 回款100： 记录回单 (Return)

[ 🏁 开始记录 ]  [ 🏁 结束记录 ]
[ 📄 账单详情 ]  [ 📥 下载报表 ]
[ ⬅️ 返回主菜单 (Back) ]
```

---

### 3. Feature 2: Guardian (The "Security" Engine)
Clicking the `[ 🛡️ 守护者系统 (Guardian) ]` button displays:

```
🛡️ 守护者系统 (Guardian System)

✨ 敬请期待 (Coming Soon)
此模块当前正在开发中。未来将包含：
• 异常交易监控 (Fraud Detection)
• 自动防抖动保护 (Anti-Spam)
• 操作压力预警 (Risk Alerts)

[ ⬅️ 返回主菜单 (Back) ]
```

---

## 🛠️ TECHNICAL IMPLEMENTATION STRATEGY

1.  **Callback Query Handling:** Use Telegram's `callback_data` (e.g., `menu_calc`, `menu_main`) to handle button clicks without sending new messages (edit existing message for a "Native App" feel).
2.  **Role Protection:** 
    *   **Operators** can see Calculation tools.
    *   **Owners** see an additional `[ 🔑 管理员工具 ]` button automatically.
3.  **Persistence:** The menu message will include an "Exit" button to clear the UI from the chat once finished.

---
**Saved on:** 2026-02-06 12:00:00
**Priority:** User Experience & Scalability
