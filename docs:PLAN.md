# docs/PLAN.md
**Status:** DRAFT  (Change to APPROVED when frozen)
**Plan Version:** 0.1
**Approved By:**
**Approved On (YYYY-MM-DD):**
**Product Type:** SaaS Web App with LLM automation
**Sensitive Data:** YES
**Payments:** Stripe (3rd party)

## 1) Problem Statement (No solutions)
What problem are we solving? Who is affected? Why now?

## 2) Users & Tenancy
- Who are the users? (individuals / teams / orgs)
- Tenancy model:
  - Single-tenant per org OR multi-tenant shared DB with tenant_id
- Data isolation rule (must be explicit)

## 3) Success Criteria (Testable)
List pass/fail criteria:
- correctness
- latency (p95)
- reliability (error rate)
- security expectations

## 4) Non-Goals
Explicit exclusions to prevent scope creep.

## 5) Constraints
- Regions, compliance, retention
- Must-not-break systems
- Budget/time limits

## 6) LLM Feature Definition
For each LLM-powered feature:
- Input types + sensitivity
- Output requirements
- Allowed data to send to LLM (explicit)
- Prompt injection risks + mitigations
- Rate limits + cost constraints

## 7) Threat Model Summary (link docs/THREAT_MODEL.md)
- Top threats
- Primary controls

## 8) Architecture (link docs/ARCHITECTURE.md)
- UI (web)
- API
- background jobs
- storage
- auth
- billing (Stripe)

## 9) Implementation Steps (Ordered)
Step-by-step, small and verifiable. Each step must have a validation method.

## 10) Test Plan
- Unit tests
- Integration tests
- Security checks
- Webhook replay/idempotency tests

## 11) Observability
- Logs (no sensitive payloads)
- Metrics
- Audit events (who did what)

## 12) Open Questions
Mark each:
- ⛔ Blocking
- ⚠️ Non-blocking

## 13) Freeze / Approval
When approved:
- Set Status to APPROVED
- No implementation may deviate without an explicit PLAN update