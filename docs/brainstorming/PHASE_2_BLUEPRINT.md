# Phase 2: World-Class Feature Blueprint (The "Diamond" Standard)

**Version:** 2.0 (AS-BUILT)
**Status:** ✅ 100% COMPLETE & VERIFIED
**Synergy Target:** High-Precision Financial Ledger & Professional PDF Reporting

## 1. Executive Summary
This blueprint documents the architecture of the live Lily Bot. It has successfully transitioned the system into a **commercial-grade, secure, and multi-currency financial engine**. Every feature is anchored in root-cause stability, with high-precision accounting and proactive reporting via the Chronos Engine.

---

## 2. Engineering Architecture & Root Causes

### 2.1 The "Vault" (Licensing & Security)
- **Root Cause Resolution:** Secure tenancy is enforced via a Licensing middleware.
- **Implementation:** Random high-entropy strings (e.g., `LILY-A1B2-C3D4`) tied to Group IDs.
- **Enforcement:** Commands are auto-rejected with a "Contact Admin" prompt if the group is unlicensed or the user is not an authorized Operator.

### 2.2 The "Exchange" (Adaptive Rate Engine)
- **Implementation:** Concurrent multi-currency display.
- **Logic:** The system processes `USD`, `MYR`, `PHP`, and `THB` simultaneously. If a manual rate is set (> 0), it automatically injects a conversion block into the final Statement.

### 2.3 The "Ledger" (Visual Excellence & Structural Clarity)
- **Formatting Rule:** All Payouts (`PAYOUT`) are prefixed with `-` and formatted to 2 decimals for accounting clarity.
- **Display logic:** 
    *   *Inputs:* Valid Transactions for Business Day X.
    *   *Optimization:* "Top 5" concise view for mobile, with full history available in PDF.
*   **The Artifact (Output Statement):**
    ```text
    入款（3笔）：
     10:44:44  587.76
    
    下发（1笔）：
     11:20:00  -500.00
    
    总入款：587.76
    费率：0.00%
    USD汇率：7.25
    应下发：587.76｜81.07 USD
    总下发：-500.00｜-68.97 USD
    余：87.76｜12.10 USD
    ```

---

## 3. Comprehensive Command Reference

### 3.1 Core Operations
| User Command | Alias | Logic |
| :--- | :--- | :--- |
| `开始` | `/start` | Activation Slogan -> Sets state to `RECORDING`. |
| `结束记录` | - | Freezes Day -> Generates Proactive PDF. |
| `+XXX` | - | Deposit calculation with precision fee handling. |
| `下发XXX` | - | Payout recording (Prefixed with `-`). |
| `回款XXX` | - | Return recording (Credit to system). |
| `显示账单` | `/bill` | Concise "Top 5" summary. |

### 3.2 Reporting & Audit
| User Command | Alias | Format |
| :--- | :--- | :--- |
| `下载报表` | `/export` | **World-Class PDF Statement** (Songti Font). |
| `导出Excel` | `/excel` | CSV Audit Trail (UTF-8 BOM). |
| `清理今天数据` | `/cleardata` | Destructive clearing (Operator only). |

---

## 4. Engineering Synergy Modules

### 4.1 Chronos Auto-Rollover
- **Root Cause:** Reactive systems fail when users forget to close the day.
- **Synergy:** Chronos proactively closes every active group at 4:00 AM, generates the final statement, and resets the state to `WAIT_FOR_START`.

### 4.2 PDF Statement Module (src/core/pdf.ts)
- **High-Fidelity Rendering:** Uses `pdfkit-table` to generate professional, non-editable statements.
- **Localization:** Injected `/System/Library/Fonts/Supplemental/Songti.ttc` for perfect Chinese label rendering.

---

## 5. Security & RBAC (Verification)
- **Least Privilege:** Group Admins are NO-OP by default. Promotion to `Operator` is mandatory for ledger access.
- **Feedback Loop:** Unauthorized users receive: `❌ 您不是操作人，请联系管理员。`

---
**Verified Completion Date:** 2026-02-05
