# AGENT_CONSTITUTION.md
**Version:** 2.0 (Enterprise)
**Applies to:** All agentic work (Antigravity) and human changes in this repository.
**Goal:** Highest security, stability, scalability by default. Prevent misinterpretation and symptom-only patching.

## 0) Core Intent
- NotebookLM produces plans/specs. Antigravity executes them.
- The agent is not allowed to invent product requirements.
- This document is the supreme rulebook for changes.

## 1) Authority Hierarchy (Hard Rule)
1. AGENT_CONSTITUTION.md
2. docs/PLAN.md (Status: APPROVED)
3. docs/SECURITY_BASELINE.md + security/* policies
4. Existing code
5. Agent suggestions

If conflicts exist → STOP and report the conflict.

## 2) Execution Preconditions (Hard Gate)
Antigravity may not implement unless:
- docs/PLAN.md exists AND Status is APPROVED
- Blocking questions are empty
- Success criteria are testable
If not met → STOP and ask.

## 3) Root Cause Mandate (Zero Symptom Patching)
For any bug, incident, or failure:
- Identify root cause in 1 sentence
- Explain why the fix addresses that cause
- Add/adjust a test OR justify why not
If root cause is uncertain → STOP (do not guess).

Workarounds must be explicitly labeled `WORKAROUND:` and include:
- why it is temporary
- what the real fix is
- a follow-up issue item in PLAN.md

## 4) Security Non-Negotiables (Sensitive Data SaaS)
- Least privilege everywhere (DB, services, tokens).
- Never log secrets, tokens, raw prompts with sensitive data, or PII.
- Validate all external input (API, webhooks, uploads).
- Server-side authorization checks for every tenant-scoped operation.
- Enforce tenant isolation: never allow cross-tenant reads/writes.
- Use HTTPS-only cookies, secure session handling, CSRF protections where applicable.
- Stripe: use hosted checkout + webhooks; never store card data.

## 5) LLM Safety Rules (Data Leakage Prevention)
- Never send secrets/PII to an LLM unless explicitly allowed by PLAN.md.
- Default: redact/trim user content before LLM calls.
- Log only metadata (token counts, latency, model name), never raw sensitive payloads.
- All LLM outputs must be treated as untrusted input (validate/escape).
- Prompt injection defenses required for “tools” or retrieval flows (PLAN must specify).

## 6) Scalability Defaults
- Stateless web service by default.
- Long tasks must go to a background job queue (not in request/response).
- Idempotency for webhooks and background tasks.
- DB migrations must be safe; destructive migrations require explicit approval.
- Caching only with clear invalidation rules.

## 7) Stability & Quality Gates
- No disabling tests to pass CI.
- No swallowing errors (empty catch blocks) unless explicitly justified.
- One logical change per PR/commit where possible.
- No drive-by refactors.

## 8) Clarification Threshold (Mandatory Pause)
STOP and ask if:
- requirement ambiguity exists
- multiple reasonable interpretations exist
- a security invariant may be violated
- a destructive operation is needed
Silence is not consent.

## 9) Required Reporting Format (Every agent response)
- What changed
- Why changed (root cause)
- Tests added/updated (or justification)
- Risks + mitigations
- Follow-ups

## 10) Definition of Done
Done only when:
- Success criteria satisfied
- Tests pass
- Security baseline not violated
- No blocking questions remain

## 11) Amendment Rule
Changes to this constitution require:
- explicit approval
- version bump
- written rationale in PR description