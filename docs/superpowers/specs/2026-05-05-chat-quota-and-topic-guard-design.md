# Chat Quota And Topic Guard Design

Date: 2026-05-05
Project: `personal-web`
Scope: anonymous chat quota enforcement, topic moderation, usage visibility, exhausted-quota UX

## Goal

Protect paid LLM spend in the website chat without requiring login, while keeping UX understandable and bilingual (`en`/`es`).

The system must:

- enforce a rolling 24-hour usage quota based on tokens, not message count
- show token consumption in the UI while a response is streaming
- block real LLM usage once the 24-hour quota is exhausted
- keep the chat interactive after exhaustion using local prerecorded sarcastic replies
- redirect exhausted users toward the contact section
- run a lightweight topic guard every 8 user messages
- apply soft topic moderation: warn first, block on repeated off-topic behavior
- support full i18n for all user-visible states

## Non-Goals

- perfect user identity across all browsers, devices, and privacy tools
- hard anti-fraud guarantees without login
- charging or debiting the user's visible quota for moderation overhead
- replacing the current chat history model unless needed for quota support

## Constraints

- the project currently has no authentication
- the current anonymous identity is based on `localStorage`, which does not survive incognito or storage resets
- users behind the same network should not be blocked just because one person used up a quota
- the solution should start with low incremental cost
- all user-visible copy must support existing i18n conventions

## Existing Context

Current relevant code:

- `components/chat.tsx` manages UI chat state, local `anon_id`, commands, and API calls
- `app/api/chat/route.ts` streams the main LLM response
- `app/api/history/route.ts` persists chat messages in Supabase
- `app/api/sessions/route.ts` reconstructs prior sessions
- `app/api/quip/route.ts` already uses a separate small model path for lightweight generated quips
- `supabase/migrations/20260427000001_create_chat_messages.sql` defines existing message persistence

The current system does not enforce quota, does not persist token usage, and does not have topic moderation.

## Recommended Approach

Use a layered anonymous-control design:

1. hybrid visitor identity
2. backend token quota with rolling 24-hour window
3. streaming quota telemetry to the UI
4. soft topic moderation every 8 user messages
5. exhausted-quota UX with local sarcastic fallback replies
6. optional Turnstile later if real abuse appears

This avoids IP-only enforcement, which would create false positives for shared networks. IP remains an auxiliary risk signal, not the primary identity key.

## Architecture

### 1. Visitor Identity

Use multiple signals to resolve an anonymous visitor identity:

- client `anon_id` from local storage for continuity inside a browser
- server-issued signed cookie for more stable anonymous identity
- hashed request-level network signal for risk analysis only
- optional future risk flags for suspicious resets or churn

The backend resolves these into a canonical anonymous `visitor_id`. This identity is probabilistic, not absolute, but is materially better than browser storage alone.

Design rule:

- do not use IP as the quota key
- do not rely only on `anon_id`
- keep the identity resolution server-side

### 2. Token Quota

Quota is enforced on total tokens used by the main chat model over a rolling 24-hour window.

Counting rule:

- count input tokens and output tokens from the main chat model
- do not debit the user's visible quota for topic moderation calls
- moderation usage may still be logged for operator visibility

Behavior:

- accepted request: stream normally, then persist final usage
- exhausted quota at request start: do not call the main LLM
- once exhausted, all later user messages are handled locally in the frontend or by a non-LLM backend fallback

The quota limit must be environment-configurable.

### 3. Topic Guard

The topic guard runs every 8 user messages.

Allowed topic scope:

- Gutemberg's profile, background, work history, projects, services, writing, contact
- technical questions only when they relate to Gutemberg's work, stack, or experience

Disallowed topic scope:

- unrelated general-purpose chat
- arbitrary assistant tasks unrelated to the website owner
- support or problem-solving unrelated to Gutemberg

Moderation model:

- provider: OpenRouter
- model: `meta-llama/llama-3.3-70b-instruct:free`

Moderation policy:

- first off-topic event: warning / redirection
- repeated off-topic behavior after warning: block useful answer and return policy message
- if moderator fails, times out, or is unavailable: allow main request and record the moderation error

This fallback is mandatory because the free moderation route may be unstable.

### 4. Quota-Exhausted UX

When the quota is exhausted:

- the UI shows a persistent banner
- the chat remains visible and interactive
- the user can still type messages
- the main LLM is no longer called
- the chat replies with prerecorded sarcastic messages
- each reply reinforces that quota is exhausted and points the user to contact

The input is intentionally not disabled. This keeps the interface coherent while making it clear that real inference is unavailable.

### 5. Streaming Usage Visibility

The UI should show:

- tokens for the current response while streaming
- total tokens used in the rolling 24-hour window
- remaining quota or percentage remaining

Streaming display may be approximate during generation and reconcile to final persisted totals at the end of the response.

## Data Model

### `visitor_identities`

Purpose: canonical anonymous visitor mapping and risk metadata.

Fields:

- `id`
- `anon_id` nullable
- `server_cookie_id` nullable
- `current_ip_hash` nullable
- `risk_flags` jsonb
- `created_at`
- `last_seen_at`

### `chat_usage_events`

Purpose: immutable token usage ledger.

Fields:

- `id`
- `visitor_id`
- `session_id`
- `message_id`
- `direction` (`user_input`, `assistant_output`, `moderator_check`, `blocked_response`)
- `provider`
- `model`
- `input_tokens`
- `output_tokens`
- `total_tokens`
- `estimated_cost_usd` nullable
- `created_at`

### `topic_moderation_events`

Purpose: moderation history and repeat-offense tracking.

Fields:

- `id`
- `visitor_id`
- `session_id`
- `checked_after_user_message_count`
- `verdict` (`allow`, `warn`, `block`, `error`)
- `reason_code`
- `raw_label` nullable
- `created_at`

### Quota Snapshot Strategy

Version 1 should compute rolling 24-hour usage from `chat_usage_events` with an aggregate query.

If query cost becomes an issue, add either:

- a materialized view
- a cached snapshot table such as `visitor_quota_snapshots`

This optimization is explicitly deferred from the first implementation unless profiling proves it necessary.

## API Design

### `POST /api/chat`

Input:

- `messages`
- `provider`
- `model`
- `session_id`

Flow:

1. resolve `visitor_id`
2. calculate 24-hour token usage
3. if exhausted, return quota-exhausted state without calling the main LLM
4. if the current user message count hits the moderation interval, run topic moderation
5. if moderation returns `warn`, send a redirection-style assistant reply
6. if moderation returns `block`, send a policy reply and skip useful generation
7. otherwise, call the main LLM and stream response
8. emit streaming metadata for UI usage indicators
9. persist final usage and moderation events

Outputs:

- standard streamed response
- streamed quota metadata events
- or explicit quota-exhausted response
- or explicit moderation warn/block response

### `GET /api/quota`

Output:

- `tokens_used_24h`
- `tokens_limit_24h`
- `tokens_remaining_24h`
- `quota_exhausted`
- rolling-window metadata such as `window_rolling: true`

Purpose:

- hydrate the UI on load
- support banner state and counters without waiting for a send action

### `POST /api/history`

Keep the existing behavior, but align saved history with the resolved `visitor_id` where useful for analytics or future joins.

## UI Design

### Quota Banner

Banner behavior:

- persistent while quota is exhausted
- translated in all supported languages
- visible on desktop and mobile
- includes CTA to contact
- CTA scrolls to the contact section

Required content:

- title: quota exhausted
- explanation: 24-hour usage limit reached
- CTA: contact

### Exhausted Chat Replies

After exhaustion:

- user messages still render
- assistant replies come from a local i18n message pool
- replies should vary to avoid repetition

Tone:

- sarcastic
- short
- clearly prerecorded / not a live model
- not hostile

Examples in Spanish:

- "bonita tentativa. la cuota ya murió hace rato."
- "esto ahora es teatro. mensajes pregrabados únicamente."
- "sin presupuesto no hay inferencia. prueba contacto."
- "el modelo fue despedido temporalmente por exceso de consumo."

Examples in English:

- "nice try. the quota is already dead."
- "this is now theater. prerecorded replies only."
- "no budget, no inference. try contact."
- "the model has been temporarily laid off for overspending."

### Moderation Copy

Soft moderation must use i18n-backed copy for:

- warning / redirection replies
- blocked-policy replies

Recommended warning behavior:

- remind the user what the site can help with
- redirect toward profile, work, projects, services, writing, or contact

## i18n Requirements

All user-visible text must be translated:

- quota banner
- quota counters and labels
- exhausted-chat prerecorded replies
- moderation warning copy
- moderation block copy
- streaming usage labels
- any status text related to quota or availability

No inline user-facing strings should be added to the implementation unless they are temporary technical fallbacks.

## Observability

Track at minimum:

- tokens per request
- rolling 24-hour usage per visitor
- number of quota-exhausted events
- quota banner impressions
- contact CTA clicks after exhaustion
- moderation runs
- moderation verdict distribution (`allow`, `warn`, `block`, `error`)
- moderation failure rate

This instrumentation is needed to evaluate both cost protection and UX damage.

## Configuration

Environment variables:

- `CHAT_TOKENS_LIMIT_24H`
- `CHAT_MODERATION_EVERY_N_USER_MESSAGES=8`
- `CHAT_MODERATION_PROVIDER=openrouter`
- `CHAT_MODERATION_MODEL=meta-llama/llama-3.3-70b-instruct:free`
- `CHAT_MODERATION_TIMEOUT_MS`
- `CHAT_ENABLE_TURNSTILE=false`
- `VISITOR_COOKIE_SIGNING_SECRET`

## Testing Strategy

### Unit Tests

- rolling 24-hour token aggregation
- exhausted quota detection
- moderation escalation from warn to block
- language-specific prerecorded reply selection
- visitor identity resolution fallback paths

### Integration Tests

- chat request with available quota calls main LLM path
- chat request with exhausted quota skips main LLM path
- moderation runs every 8 user messages
- moderation failure falls back to allow
- quota metadata is available to the frontend
- contact CTA path remains available after exhaustion

### UI Tests

- streaming usage display updates during generation
- final totals reconcile after stream end
- persistent exhausted banner appears correctly
- exhausted mode uses prerecorded replies
- Spanish and English copies render correctly

## Rollout Plan

### Phase 1

- server-issued anonymous cookie
- backend token quota
- usage event persistence
- quota UI counters
- exhausted banner
- prerecorded sarcastic replies
- full i18n support

### Phase 2

- topic moderation every 8 user messages
- moderation telemetry

### Phase 3

- Turnstile or stronger abuse controls if actual evasion patterns justify the complexity

Recommended rollout: implement Phase 1 and Phase 2 together unless integration risk becomes larger than expected.

## Risks And Mitigations

### Anonymous Identity Is Imperfect

Risk:

- users can still evade controls with enough effort

Mitigation:

- use layered signals
- keep IP only as a secondary signal
- leave room for Turnstile later

### Free Moderation Model Instability

Risk:

- OpenRouter free route may fail or be slow

Mitigation:

- strict timeout
- fallback to allow
- log failures for later adjustment

### Streaming Token Display Accuracy

Risk:

- token display may be approximate before provider-reported final totals are known

Mitigation:

- render provisional counts during stream
- reconcile at completion

## Implementation Boundaries

This design covers:

- schema changes
- chat API behavior changes
- frontend state and UI changes
- i18n additions
- moderation integration

This design does not require:

- login or user accounts
- immediate third-party fingerprint SaaS adoption
- immediate Turnstile integration

## Decision Summary

- quota is based on total tokens over a rolling 24-hour window
- quota exhaustion must be visible and understandable in the UI
- exhausted users are redirected toward contact and get local prerecorded sarcastic replies
- topic moderation is soft, runs every 8 user messages, and uses `meta-llama/llama-3.3-70b-instruct:free`
- moderation failures do not block the main experience
- all user-visible behavior is translated through i18n
