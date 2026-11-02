# Authenticated learning task assistant

The function calls DeepSeek from the server and returns a **draft only**. It has
no task, plan, file or profile write operation. The browser must obtain explicit
confirmation, then use the existing deterministic rule engine and account-scoped
task store. Existing manual creation remains available if AI fails.

## Server configuration

Use Supabase **Edge Function Secrets**. Never put values in Git, browser assets,
test logs, chat messages or a committed environment file.

- `DEEPSEEK_API_KEY`: existing provider credential, required for paid requests.
- `DEEPSEEK_MODEL`: optional; `deepseek-flash` (default) or `deepseek-v4-pro`.
- `AI_ALLOWED_ORIGIN`: defaults to `https://buqi080318.github.io` (origin only).
- `AI_MINUTE_CALL_LIMIT`: default 2, integer 1–30.
- `AI_DAILY_CALL_LIMIT`: default 10, integer 1–1000.
- `AI_DAILY_TOKEN_LIMIT`: default 60000, integer 1–2000000.

A zero, negative or invalid setting disables paid calls with a configuration
error before quota reservation; authenticated status reports not configured. The server uses
the platform's `SUPABASE_URL`, `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEYS`
and `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEYS`; new secret keys are sent
as `apikey`, not as JWT bearer tokens. Before deploying, apply the additive AI
request-ledger migration and verify its service-role-only RPC permissions.

`verify_jwt=false` in function deployment is intentional: **every POST, including
status, verifies the supplied bearer token with this project's `/auth/v1/user`**.
Missing/invalid identities and anonymous Auth users are rejected. This supports
modern Supabase signing keys without relying on the legacy Edge gateway verifier.
CORS is an additional browser restriction and does not replace authentication.

## Protocol and failure handling

Authenticated `POST {action:"status"}` reports only `{configured,model}` without
reserving quota or calling the provider. It does not prove provider balance or
availability.

`POST {action:"parse",payload:{text,timeZone,hasAvailableTime}}` accepts at most
2000 text characters and 8192 request bytes. Other client data is discarded. The
server supplies the current timestamp. The returned model draft is:

```
{value:{title,course,deadline,deadlineText,estimateMinutes,priority,notes,
missingInformation},mode:"model",requestId}
```

Relative or absent dates always leave `deadline` blank. A retained deadline must
be a valid timezone-qualified ISO timestamp matching the explicitly stated full
calendar date **and exact time** in the user's text and supplied timezone.
Untrusted/invalid effort estimates are blank; accepted preliminary estimates are
limited to 1–10080 minutes and always require human confirmation. No availability
is inferred from the text or supplied by the model. Missing information is shown
as a bounded list of Chinese questions.

Paid calls reserve per-user minute/call/token quota atomically before contacting
DeepSeek. Every outcome is finalized in the private server ledger, with actual
prompt/completion token counts when returned by DeepSeek. Unknown usage keeps
the conservative reservation (no blind refund). Failure to reserve or finalize
accounting fails closed. There are no automatic provider retries.

Responses distinguish expired/anonymous sessions (401), oversized input (413),
quota/provider rate limits (429), provider balance (402), invalid output (502),
provider timeout (504), and configuration/accounting outages (503). Provider
messages, prompts, user text and secret values are never included in logs or
error responses. Existing `split` and `explain` calls retain draft-only behavior.

## Verification

Run `node --test scripts/assistant-proxy.test.mjs` for authentication, durable
quota gating, structured-output validation, date/effort checks, real usage
recording, safe provider failures and bounded input. Live verification must also
check the deployed ledger, authenticated status, one real model response and
the browser confirmation/save/plan flow; unit fixtures are not a live model test.

Provider contract verified against [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)
and [JSON Output](https://api-docs.deepseek.com/guides/json_mode/): fixed endpoint
`https://api.deepseek.com/chat/completions`, non-thinking mode, JSON object output,
bounded 1500 output tokens. No provider service is opened or topped up by deployment.
