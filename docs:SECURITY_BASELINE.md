# docs/SECURITY_BASELINE.md
**Minimum security controls required for all projects.**

## Secrets
- No secrets in git. Ever.
- Use environment variables or a secret manager.
- Rotate keys if leakage suspected.

## Data handling
- Minimize collection. Encrypt in transit (HTTPS) and at rest (DB defaults).
- Redact sensitive content before sending to LLM unless explicitly allowed.
- Never log PII, tokens, secrets, or raw prompts.

## Auth & access control
- Server-side authorization required for every tenant operation.
- Avoid “admin by UI only”; enforce in API.

## Webhooks (Stripe)
- Verify signatures.
- Use idempotency keys / event IDs.
- Store webhook processing results to prevent double-apply.

## Dependencies
- Lock dependencies.
- Scan for vulnerabilities in CI.