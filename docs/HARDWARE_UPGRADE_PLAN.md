# 🚀 Lily Hardware Upgrade Execution Plan (Mac Mini M4 Pro Max)

This document outlines the professional deployment and optimization strategy for migrating Lily to the high-performance **Mac Mini M4 Pro Max** infrastructure.

## 💻 Hardware Specification (The "Beast")
- **CPU/GPU:** M4 Pro Max (Next-Gen Silicon)
- **RAM:** 128GB Unified Memory (High-Bandwidth)
- **Internal Storage:** 512GB SSD
- **External Storage:** 2TB Samsung T-Series SSD (Primary Data Vault)

---

## 🏗️ Phase 1: Local Infrastructure Setup
1. **OS Optimization**:
   - Install **Docker Desktop** for containerized environment.
   - Install **Homebrew** for package management.
   - Install **Ollama** (Local AI Engine) to leverage the 128GB RAM for large models.
2. **Storage Mapping**:
   - Mount the **2TB External SSD** as the primary volume for `/data` and `/postgres`.
   - Configure **Redis Persistence** on the external SSD to prevent data loss on restarts.

## 🧠 Phase 2: The "Split-Brain" Transition
We will move the system from "Cloud-Only" to a **Cloud-Hardware Hybrid** model.

| Component | Location | Role |
| :--- | :--- | :--- |
| **Bot Receiver** | Railway (Cloud) | 24/7 Global Availability for instant replies. |
| **Heavy Workers** | Mac Mini (Local) | PDF Generation, Excel Exports, OCR Processing. |
| **AI Brain** | Mac Mini (Local) | DeepSeek-V3 or Llama-3 running on Unified Memory. |
| **The Vault** | 2TB SSD (Local) | Archival storage for historical transactions (multi-year). |

## ⚡ Phase 3: Hardware-Accelerated Features
1. **Local OCR (Vision)**: 
   - No more reliance on third-party vision APIs.
   - Use the M4 Neural Engine to read screenshot receipts in **<500ms**.
2. **Deep Reporting**:
   - Generate multi-group global comparisons that were previously too "heavy" for cloud servers.
3. **Private LLM**:
   - Host a private, un-censored financial model that never sends data to any external server.

## 🛠️ Step-by-Step Migration Guide (Day 1)
1. **Environment Sync**: Clone the repo and setup `.env.local`.
2. **Tunneling**: Configure **Cloudflare Tunnels (cloudflared)** to securely expose the Mac Mini workers to the Railway bot without opening router ports.
3. **Database Migration**: Sync production PostgreSQL data to the local "Vault" (2TB SSD).
4. **Health Check**: Verify that `npm run dev` handles a "Heavy Task" (e.g., 100-page PDF) in under 10 seconds.

---

**Status:** 🗒️ PLAN SAVED.
**Next Action:** Await user notification of hardware arrival.
