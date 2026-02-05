# docs/THREAT_MODEL.md
**Scope:** SaaS web app with LLM automation + Stripe billing.

## 1) Assets (what we protect)
- User accounts + sessions
- Tenant data (sensitive)
- API keys / secrets
- Stripe webhook secrets
- LLM prompts/outputs (may contain sensitive user data)

## 2) Primary threats (top list)
- Account takeover (phishing, credential stuffing)
- Broken access control (cross-tenant data leakage)
- Injection (SQL, prompt injection via tool/retrieval, XSS)
- Data exfiltration via logs/analytics
- Webhook spoofing / replay
- SSRF and unsafe URL fetching (if supported)
- Supply chain vulnerabilities (dependencies)
- Misconfiguration (public buckets, exposed env vars)

## 3) Required controls
- Strong auth + MFA support for admins (roadmap)
- Server-side authorization checks on every request
- Tenant isolation tests
- Input validation + output escaping
- Webhook verification + idempotency
- Secrets scanning + dependency scanning in CI
- Strict logging policy (no sensitive payloads)

## 4) LLM-specific threats + controls
- Prompt injection: treat retrieved text as untrusted; sandbox tool calls.
- Data leakage: redact and minimize; never include secrets/PII by default.
- Model output misuse: validate/escape outputs; never execute model output as code.

## 5) Security acceptance tests (examples)
- Attempt cross-tenant access must fail
- Webhook signature invalid must fail
- Webhook replay must be idempotent
- Logs must not contain token/secret patterns