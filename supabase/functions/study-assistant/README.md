# Optional assistant — disabled in production

This function and its additive budget migration have **not** been deployed or applied.
The static site works in rule mode without them.

To enable later: review/apply `20261101_optional_assistant_budget.sql`, configure
server secrets `AI_API_KEY`, `AI_MODEL`, `AI_ALLOWED_ORIGIN` (production origin),
and the Supabase server environment (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`); deploy `study-assistant`, verify auth/quota behavior,
then set public `assistantEnabled: true`. Never put server secrets in `site/`.
Set the provider account's monetary budget before enabling. SQL limits are
conservative per-user/global daily token reservations and calls, not currency limits.

Reference: [Supabase Auth verification](https://supabase.com/docs/reference/javascript/auth-getuser),
[OpenAI request fields](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).
