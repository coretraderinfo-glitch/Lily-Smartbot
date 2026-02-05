# 🧠 BRAINSTORM: ADAPTIVE CURRENCY & MOBILE WEB VIEW (PHASE 3+)

**Status:** 📝 Saved for Future Implementation
**Objective:** Eliminate hardcoded "CNY" labels to support global clients and provide a sleek mobile-friendly web view for real-time monitoring.

---

## 🎨 PART 1: ADAPTIVE CURRENCY PDF (ELIMINATING CNY)

### 1. The "Ghost Label" Strategy
Instead of forcing "CNY", the PDF will dynamically adapt its terminology based on the group's settings.

*   **Logic:** 
    *   If `currency_symbol` is set in the database (e.g., "USD"), all PDF fields will display "USD".
    *   If no `currency_symbol` is set, the PDF will use a neutral label like **"Amount (金额)"** with no currency code.
*   **Forex Filter:** The PDF will *only* show the conversion tables for rates that are > 0. If a client doesn't use MYR, the MYR section will be completely removed from their view.

---

## 📱 PART 2: THE "LILY LIVE" MOBILE WEB VIEW

Instead of just a static PDF, we brainstormed providing clinical-grade real-time web access.

### 1. The "Secret-Link" Access
*   **The Idea:** The bot generates a unique, unguessable URL (e.g., `lily-bot.re/view/a1b2c3d4...`).
*   **Simplicity:** No username or password required for the client (Speed-to-value).
*   **Expiry:** The link expires after a set period (synchronized with the 3-day data retention).

### 2. UI/UX Design (Mobile First)
*   **Dashboard Style:** A sleek, glassmorphism-style mobile web page.
*   **Real-time:** The page "Auto-Refreshes" or uses WebSockets to show new `+` and `-` entries as they happen.
*   **Visual Highlights:** 
    *   Green badges for Deposits.
    *   Red pulses for Payouts.
    *   A massive "Live Balance" at the top.

### 3. Implementation Path
*   **Backend:** Add a simple API route to the existing bot server.
*   **Frontend:** A single-page, responsive dashboard optimized for Telegram's In-App Browser.

---

## 🛠️ FUTURE IMPLEMENTATION STEPS (WAITING FOR APPROVAL)
1.  **Refactor `PDFExport`**: Replace the "CNY" string with a dynamic variable `group.currency_symbol || ''`.
2.  **Web Server Setup**: Enable an HTTP route on the bot to serve the mobile dashboard.
3.  **Tokenized Routes**: Implement secure, one-time tokens for web access.

---
**Saved on:** 2026-02-06 01:58:00
**Priority:** UX Enhancement / Global Market Expansion
