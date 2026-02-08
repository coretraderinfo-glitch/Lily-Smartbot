# 💎 LILY ENTERPRISE COMMAND CENTER: MASTER SPECIFICATION

**Status**: PROPOSED | **Version**: 1.0.0 | **Owner**: Robin Ang (System Owner)
**Mission**: To centralize global control of 3,000+ Lily environments while maintaining 100% security, zero-command noise, and forensic financial accuracy.

---

## 🛡️ I. THE ARCHITECTURAL CORE
The Lily system is evolving into a **Dual-Node Architecture**.

1.  **Node A: The Accountant (Telegram Bot)**
    *   **Focus**: High-speed transaction recording, math, and PDF generation.
    *   **Access**: Operators and Clients.
2.  **Node B: The Oracle (Central Backend)**
    *   **Focus**: Remote configuration, monitoring, and monetization.
    *   **Access**: Robin Ang (Private Login Only).

*The nodes are linked via the **Railway PostgreSQL Shared Heart**. Change on the Web = Instant change in Telegram.*

---

## 🛠️ II. THE REBORN DATABASE (HIDDEN SWITCHES)
The `groups` and `group_settings` tables will be expanded with "Enterprise Flags" that are invisible to the Telegram user.

| Toggle ID | Function | Options | Default |
| :--- | :--- | :--- | :--- |
| `ai_brain_enabled` | Activates Google Gemini AI Brain | ON / OFF | OFF |
| `guardian_mode` | Active protection against malicious files/spam | ON / OFF | OFF |
| `anti_swap_enabled` | Forensic check for fake screenshots | ON / OFF | OFF |
| `usdt_tracing` | Automated blockchain verification | ON / OFF | OFF |
| `chart_logs_enabled` | **PERMANENT** Staff-Only Audit for training/closing | ON / OFF | OFF |
| `license_tier` | Defines group power level | TRIAL / STANDARD / PREMIUM | TRIAL |
| `language_mode` | Global slogan/report language | CN / EN / MY / BILINGUAL | CN |
| `timezone_override` | Custom time for rollover | e.g. "Asia/Dubai" | Asia/Shanghai |
| `reset_hour` | Custom hour for auto-closure | 0 - 23 (Integer) | 4 (AM) |
| `robin_lock` | Master freeze on all operations | ACTIVE / FROZEN | ACTIVE |

---

## 🔑 III. THE LOGIN PROTOCOL (MAGIC PASS)
To solve "Password Fatigue," the Backend will use **Encrypted One-Time Magic Links**.

1.  **Request**: Robin types `/admin` in his private dev chat with Lily.
2.  **Generate**: Lily generates an HMAC-signed URL: `lily-admin.com?t=[SECURE_SECRET]`.
3.  **Expiry**: The link is valid for **10 minutes** only.
4.  **Security**: After login, a secure browser cookie is stored for **30 days** of easy access.

---

## 🚀 IV. THE TRIAL & FRAUD PREVENTION (ANTI-HOPPING)
Lily will protect Robin's income by preventing trial abuse.

1.  **User Identity Trace**: Every group will store the `creator_id` (Telegram ID of the person who invited Lily).
2.  **Master Registry**: A new table `trial_registry` will track every Telegram User ID that has ever activated a trial.
3.  **The Rule**: 
    - 1 User ID = 1 Trial (48 Hours).
    - If a user tries to move Lily to a new group, Lily sees their ID in the registry and asks for a **Paid Key**.

---

## 🌍 V. GLOBAL LOCALIZATION ENGINE
Lily will adapt her "Personality" based on the group's Language Flag.

*   **CN (Traditional)**: 🌙 漫长的一天辛苦了... (Classic)
*   **EN (Global)**: 🌙 It’s been a long day, well done! (Professional)
*   **MY (Local)**: 🌙 Kerja keras hari ini dah habis! (Local)
*   **BILINGUAL**: Returns both CN and the local language (Elite Status).

---

## 💡 VI. DATA RETENTION & SECURITY
*   **Rolling Purge**: Strict 3-day data window maintained by the Chronos engine.
*   **Vault Protection**: After 3 days, data is wiped from the live ledger to protect client privacy.
*   **Remote Flush**: Robin can click a button on the Backend to instantly wipe all data for a specific group if suspicious activity is detected.

---

## 🎨 VII. THE VISUAL ROADMAP (MAC MINI M4 PRO)
1.  **Main View**: A dashboard showing "Total Empire Volume" (CNY sum across all 3,000 groups).
2.  **Client Grid**: Searchable list of all groups with "Status Cards" (Green/Daily Volume/Expiry).
3.  **One-Click Toggle**: Change any "Hidden Switch" with a simple visual button.

---

## 🛡️ VIII. THE GUARDIAN SHIELD (OPERATIONAL RULES)
The Guardian Module is a high-security layer that operates independently of the ledger.

1.  **Malware Predator (Auto-Delete)**
    - **Trigger**: Any message containing a document or file with blacklisted extensions.
    - **Blacklist**: `.zip`, `.apk`, `.exe`, `.scr`, `.bat`, `.cmd`, `.sh`.
    - **Action**: Immediate delete + Bot warning message targeting the sender.
    - **Alert**: Tag all registered admins with a "⚠️ SECURITY ALERT" notice.

2.  **Admin Sentinel & Onboarding**
    - **Command**: `/setadmin` (Reply to user or tag). Stores admins in `group_admins` table.
    - **Join Event**: When a new member joins, Lily retrieves the Admin list and tags them: *"📢 @admin1 @admin2 - New member arrived!"*
    - **Welcome Message**: Sends a rotating slogan in the group's active `language_mode`.

3.  **Activation Policy**
    - The module is **DORMANT** by default.
    - Activation requires a Boolean flag change in the `group_settings` database.
    - **Logic**: No client can turn this on; it is a "Value Added Service" controlled by Robin.

---

**CONFIDENTIALITY NOTICE**: This document and the resulting implementation are the property of Robin Ang. The "Invisible Command" logic is a proprietary business secret.
