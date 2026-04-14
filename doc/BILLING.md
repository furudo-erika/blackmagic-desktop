# Billing

## Model Pricing (OpenAI list, what we charge the user)

| Model | Input $/MTok | Output $/MTok |
|---|---|---|
| gpt-5.3-codex | 2.50 | 7.50 |
| gpt-5.3-codex-spark | 2.50 | 7.50 |
| gpt-5.2-codex | 2.50 | 7.50 |
| gpt-5.1-codex | 1.25 | 5.00 |
| gpt-5.1-codex-max | 1.25 | 5.00 |
| gpt-5.1-codex-mini | 0.15 | 0.63 |
| gpt-5-codex | 1.25 | 5.00 |
| gpt-5-codex-mini | 0.15 | 0.63 |

Zenn charges us 50% of list. Our margin = 50% of what the user is billed.

## Token event

On every `response.completed`, daemon posts:

```http
POST ${BM_BILLING_URL}/api/token-events
Authorization: Bearer ck_...

{
  "model": "gpt-5.3-codex",
  "input_tokens": 1234,
  "output_tokens": 567,
  "cost_cents": 12,
  "agent": "researcher",
  "run_id": "2026-04-14T12-34-56-researcher",
  "client": "desktop",
  "client_version": "0.1.0"
}
```

Backend (`blackmagic-ai/src/app/api/token-events/route.ts`):

1. Validate `ck_` bearer → resolve `user_id`.
2. Insert `bm_token_events` row.
3. Debit `user_credit.balance_cents` by `cost_cents`.
4. If balance ≤ 0, flip `user_credit.blocked = true`, return 402.
5. Return `{ ok, balance_cents }`.

## Supabase schema (post-cleanup)

**Keep**: `user`, `session`, `account`, `verification`, `api_keys`, `api_usage_logs`, `user_credit`, `credit_transaction`, `payment`, `pending_developer_credits`.

**Add**: `bm_token_events`:
```sql
CREATE TABLE bm_token_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  api_key_id    uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  model         text NOT NULL,
  input_tokens  integer NOT NULL,
  output_tokens integer NOT NULL,
  cost_cents    integer NOT NULL,
  agent         text,
  run_id        text,
  client        text,
  client_version text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bm_token_events_user_created_idx ON bm_token_events(user_id, created_at DESC);
```

**Drop**: every `bm_*` table that stores domain data — see cleanup migration.
