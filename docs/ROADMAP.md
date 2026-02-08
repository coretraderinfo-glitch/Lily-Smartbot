# 🗺️ LILY SMARTBOT ROADMAP

This document tracks the evolution of Lily. It is updated during "Brainstorm Mode" when the user says **SAVE**. Implementation only happens when the user says **APPROVE**.

---

## ✅ PHASE 1 & 2: RECENTLY IMPLEMENTED
*Features that are live and verified in production.*

- [x] **Core Financial Engine**: High-precision calculation using `Decimal.js`.
- [x] **Bilingual Support**: Full Chinese/English recognition for all core commands.
- [x] **"The Negative Gate"**: Strict validation preventing accidental accounting errors.
- [x] **Multi-Currency**: Integrated support for CNY, USD, MYR, PHP, THB.
- [x] **World-Class Reporting**: Professional PDF/CSV exports with localized fonts and left-aligned numbers.
- [x] **Military-Grade Security**: Centralized Owner Registry and reply-to RBAC system.
- [x] **Chronos Engine**: Automated 4 AM business day rollover and archiving.
- [x] **Active Deployment**: Fully synced with GitHub and auto-deploying to Railway.

---

## 🚀 PHASE 3: BRAINSTORMING SANDBOX (SAVED)
*Ideas that have been "Saved" but NOT yet "Approved" for implementation.*

### 1. Defensive Engineering (The Digital Shield)
- [ ] **Spam Shield (Rate Limiting)**: Protect the bot from rapid-fire message abuse.
- [ ] **Duplicate Guard**: Prevent identical transactions sent twice within 3 seconds.
- [ ] **Tamper Alerts**: Detect if someone tries to bypass the bot to edit data.

### 2. Client UX (The Web Experience)
- [ ] **Inline Button "点击跳转完整账单"**: Attach a direct link button to the summary message.
- [ ] **Lily Live-Web-Reader**: Secure mobile-friendly web view that "pops out" (点出) when the button is clicked.
- [ ] **On-Demand PDF (Inside Web)**: PDF is only generated/downloaded when the user clicks a button *inside* the web reader.
- [ ] **Smart Trigger**: Auto-show the "Jump" button after 5+ daily entries to keep the chat clean.

### 3. Data Retention & Security
- [ ] **Extended Archives**: Increase PDF/Snapshot retention from 3 days to 30+ days.
- [ ] **Cloud Vault (S3)**: Store PDF reports in professional cloud storage for "Forever" access.
- [ ] **Automated Off-site Backups**: Hour-by-hour database mirroring for 100% disaster recovery.

### 4. Developer Standards
- [ ] **Global Enterprise JSDoc**: Standardizing documentation across all `src/` modules.
- [ ] **Internal Test Suite**: Automated math verification for the Ledger engine.

### 4. Advanced PDF/UX
- [ ] **Multi-Page Support**: Improved table splitting for very long daily reports.
- [ ] **Custom Branding**: Allow groups to upload their own logo for the PDF header.

### 5. Advanced Monetization & Scaling
- [ ] **Lily AI "Brain" (Special License)**: Integrate Google Gemini for human-like financial analysis and client chat (Gated by Premium Key).
- [ ] **Lily "Persona" Customization**: Allow Owners to define Lily's personality (Professional/Friendly/Protective).
- [ ] **Auto-Trial Engine**: 48-hour full-access trials for new groups, auto-activating on the first "开始" command.
- [ ] **Anti-Hopping Registry (Security)**: Link trials to unique User IDs and Group Creator IDs to prevent multiple trials for the same client.
- [ ] **Manual Override Console**: Special commands for the System Owner (Robin) to manually grant, extend, or revoke trials instantly.

### 6. Global Operational Flexibility
- [ ] **Individual "Island" Timezones**: Support per-group timezone settings (e.g., `设置时区 Asia/Dubai`).
- [ ] **Custom Reset Hours**: Allow groups to change the 4 AM auto-rollover to any hour (e.g., 6 AM or 8 AM for late-night teams).

---

## 🛠️ PENDING APPROVAL & CURRENT FOCUS
*Current state of the project development.*

1.  **[DONE] Phase 4, Step 1: Master System Specification**: [View Doc Here](/Users/robinang/Desktop/SYSTEM/Lily/docs/specs/SYSTEM_SPEC.md)
2.  **[PENDING] Phase 4, Step 2: Database Infrastructure**: Preparing the new "Hidden Switch" columns on Railway.

---

*Note: This roadmap is maintained by Antigravity in collaboration with the System Owner.*
