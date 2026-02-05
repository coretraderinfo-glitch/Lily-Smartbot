# docs/ARCHITECTURE.md
**Goal:** Secure, stable, scalable SaaS with LLM automation.

## A) High-level components
1) Web UI (dashboard)
2) API service (authz + business logic)
3) Background worker (LLM jobs, long tasks)
4) Database (Postgres recommended for SaaS)
5) Cache (optional later)
6) Object storage (uploads) (optional)
7) Stripe (hosted checkout + webhooks)

## B) Key architectural rules
- All tenant-scoped tables include tenant_id; all queries must filter by tenant_id.
- Background jobs are idempotent and retry-safe.
- Webhooks are verified, idempotent, and never trust payload blindly.
- Secrets are stored only in a secret manager / environment variables (never in code).
- LLM calls occur in worker when possible; request path should be fast.

## C) Data flows
- User → Web UI → API → DB
- User action triggers job → API enqueues → Worker processes → DB updates
- Stripe webhook → API verifies → DB updates (subscription state)

## D) Default scalability posture
- Stateless API and Worker (horizontal scale)
- DB is the single source of truth
- Queue decouples slow tasks
- Add caching only after measuring

## E) Observability baseline
- Structured logs (redacted)
- Metrics: latency p95, error rate, queue depth, LLM cost
- Audit events: login, data export, admin actions, billing events

## F) Compliance basics (starter)
- Data retention policy documented
- Access control: least privilege
- Secure backups for DB