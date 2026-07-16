# LangChain createAgent + CopilotKit Migration Design

Date: 2026-07-11
Project: `personal-web`
Scope: replace the Vercel AI SDK across the whole stack with LangChain `createAgent` (backend) and CopilotKit (frontend), keeping all current chat features and Supabase-backed state.

## Goal

Move the chat/agent stack off the Vercel AI SDK and onto LangChain `createAgent` on the backend and CopilotKit on the frontend, with a **clean, modular, framework-agnostic agent layer**. No chat feature or persisted data is lost in the process.

The system must:

- run the agent with LangChain `createAgent`, streaming responses to a CopilotKit UI
- keep the multi-provider model selector (Anthropic, NVIDIA NIM, OpenRouter)
- keep the site-navigation behavior (agent scrolls the site to a section)
- keep the rolling 24h token quota, topic moderation, anonymous visitor identity, chat history and sessions — all backed by Supabase
- keep bilingual (`en`/`es`) user-visible copy
- keep Langfuse observability
- remove the Vercel AI SDK (`ai`, `@ai-sdk/*`) entirely
- be deployable as a single Docker container (not tied to Vercel), with the agent running in-process inside Next.js

## Non-Goals

- adopting LangGraph Platform or a separate LangGraph server process (in-process only for now)
- replacing Supabase with LangGraph threads/checkpointer for persistence
- pixel-perfect reproduction of the current terminal aesthetic (theming approximation is acceptable)
- changing the quota/moderation *semantics* (only the enforcement layer moves)
- redesigning the site sections or non-chat UI

## Constraints

- deployment is not limited to Vercel; a Docker image hosted anywhere is acceptable and expected
- Supabase remains the single source of truth for history, quota, visitor identity, and moderation events
- the agent runs stateless per request; conversation history is supplied by the client / Supabase, not a checkpointer
- free models (OpenRouter/NVIDIA) are unreliable with tool calls and structured output; the design must tolerate that
- all user-visible copy keeps existing i18n conventions

## Existing Context

Vercel AI SDK is used in exactly four places:

| Call site | File | AI SDK API | Purpose |
|---|---|---|---|
| Main agent | `app/api/chat/route.ts` | `streamText` + `navigate` tool + `stepCountIs(2)` | Streaming chat + site navigation |
| Topic moderation | `lib/chat/moderation.ts` | `generateObject` (Zod schema) | Classify on/off-topic every N user messages |
| Navigation quip | `app/api/quip/route.ts` | `generateText` | Short sarcastic comment on navigation |
| Frontend | `components/chat.tsx` | `@ai-sdk/react` `useChat` + `DefaultChatTransport` | Consumes the AI SDK UI Message Stream |

Providers today: Anthropic via `@ai-sdk/anthropic`; NVIDIA NIM and OpenRouter via `@ai-sdk/openai` with a custom `baseURL` (both OpenAI-compatible).

Well-separated modules already in place (good foundation to preserve): `lib/chat/quota.ts`, `lib/chat/moderation.ts`, `lib/chat/visitor.ts`, `lib/chat/exhausted-replies.ts`, `lib/models.ts`, plus Vitest tests. Supabase tables: `chat_messages`, plus quota/moderation tables from `20260505000002_add_chat_quota_tables.sql`.

Observability today: manual OpenTelemetry spans (`@langfuse/tracing`, `@langfuse/otel`, `@opentelemetry/*`) wired in `instrumentation.ts` / `lib/otel.ts` and inside the routes.

## Recommended Approach

A layered migration with a framework-agnostic agent core:

1. a new `lib/agent/` layer that knows nothing about HTTP or CopilotKit
2. quota and moderation enforced as **LangChain middleware** (short-circuit with a canned message), reusing the existing pure helpers
3. built-in middleware for per-run caps and resilience
4. CopilotKit runtime mounted in a single Next.js route, running the `createAgent` graph in-process via the AG-UI in-memory adapter
5. CopilotKit prebuilt chat UI, themed toward the terminal look, with peripheral features (quota, model selector, history) as surrounding custom UI
6. `navigate` implemented as a CopilotKit **frontend action** rather than a backend tool
7. Langfuse via the LangChain `CallbackHandler` instead of manual OTEL spans

## Module Architecture

The centerpiece. `lib/agent/*` is testable without starting Next.js; only `runtime.ts` and the route touch CopilotKit.

```
lib/agent/                      NEW — LangChain agent logic, no HTTP/CopilotKit coupling
  models.ts                     ChatModel factory: provider -> ChatAnthropic | ChatOpenAI(baseURL)
  system-prompt.ts              the SYSTEM prompt (extracted from the old route)
  agent.ts                      buildAgent({provider, model}) = createAgent(model + prompt + middleware)
  middleware/
    quota.ts                    beforeModel: load Supabase snapshot, short-circuit if exhausted
    moderation.ts               beforeModel: topic guard every N msgs, short-circuit warn/block
    persistence.ts              afterModel: persist assistant usage event to Supabase
  runtime.ts                    CopilotRuntime + AG-UI in-process adapter over the agent
lib/quip/quip.ts                NEW — quip via model.invoke (replaces generateText)
lib/tracing/langfuse.ts         NEW — Langfuse CallbackHandler for LangChain

lib/models.ts                   KEEP — UI-facing catalog (labels/ctx/free)
lib/chat/moderation.ts          KEEP — classifier + copy/decision helpers (swap generateObject -> structured output)
lib/chat/quota.ts               KEEP — unchanged
lib/chat/visitor.ts             KEEP — unchanged
lib/chat/exhausted-replies.ts   KEEP — unchanged

app/api/copilotkit/route.ts     NEW — mounts CopilotRuntime (replaces app/api/chat/route.ts)
app/api/quip/route.ts           KEEP route, swap AI SDK -> lib/quip
app/api/quota/route.ts          UNCHANGED
app/api/history/route.ts        UNCHANGED
app/api/sessions/route.ts       UNCHANGED

components/chat.tsx             REWRITE — <CopilotKit> + prebuilt <CopilotChat> themed + peripheral UI
```

### Module responsibilities

- **`lib/agent/models.ts`** — `getChatModel(provider, modelId)`. Anthropic -> `new ChatAnthropic({ model, maxTokens: 200 })`; NVIDIA/OpenRouter -> `new ChatOpenAI({ model, apiKey, configuration: { baseURL, defaultHeaders } })`. Pure factory, no side effects. Depends on env for keys.
- **`lib/agent/system-prompt.ts`** — exports the `SYSTEM` string (moved verbatim from the route). Includes navigation instructions.
- **`lib/agent/agent.ts`** — `buildAgent({ provider, model })` returns a `createAgent(...)` graph assembled from the model, system prompt, and the middleware list. Built per request (cheap; stateless).
- **`lib/agent/middleware/quota.ts`** — `beforeModel` hook: resolves visitor, loads the 24h token snapshot from Supabase, and short-circuits with the localized quota-exceeded message when exhausted. Reuses `lib/chat/quota.ts` + `lib/chat/visitor.ts` + `getQuotaExceededCopy`.
- **`lib/agent/middleware/moderation.ts`** — `beforeModel` hook: every N user messages, runs the topic classifier and applies warn/block, short-circuiting with the localized policy copy. Reuses `shouldRunTopicModeration`, `classifyTopicConversation`, `getModerationAction`, `getTopicPolicyCopy`, and the `topic_moderation_events` table.
- **`lib/agent/middleware/persistence.ts`** — `afterModel` hook: persists the *successful* assistant usage event (input/output tokens) to Supabase via `persistUsageEvent`. The quota and moderation middleware persist their own events on short-circuit paths, matching current behavior: `blocked_response` (quota exhausted / topic block), and `moderator_check` (moderation model token usage). This keeps all `persistUsageEvent` `direction` values from the current route intact.
- **`lib/agent/runtime.ts`** — constructs the `CopilotRuntime` with the in-process agent (AG-UI in-memory adapter). Reads `provider`/`model` from request context and calls `buildAgent`.
- **`lib/quip/quip.ts`** — `generateQuip({ section, lang, messages })` using `getChatModel(...).invoke(...)`. Replaces `generateText`.
- **`lib/tracing/langfuse.ts`** — builds the Langfuse `CallbackHandler`; exported for use as `callbacks` on agent/model invocations.

## Middleware Order (Guards)

Custom guards run first (stop before spending tokens); built-in caps/resilience next; persistence last.

```
middleware: [
  quotaMiddleware(),                            // CUSTOM — Supabase 24h token budget, short-circuit canned
  moderationMiddleware(),                       // CUSTOM — topic guard every N msgs, short-circuit warn/block
  modelCallLimitMiddleware({ runLimit: 2,       // BUILT-IN — replaces stepCountIs(2)
                             exitBehavior: 'end' }),
  modelRetryMiddleware({ maxRetries: 2 }),      // BUILT-IN — resilience for flaky free models (optional)
  persistenceMiddleware(),                      // CUSTOM — afterModel: persist usage to Supabase
]
```

**Built-in middleware findings:** LangChain v1 ships `modelCallLimitMiddleware`, `toolCallLimitMiddleware`, `summarizationMiddleware`, `modelFallbackMiddleware`, `modelRetryMiddleware`, `piiMiddleware`, etc. **None enforce a persistent, per-visitor, token-based 24h budget** — they are all in-memory, per-thread/per-run, and count *calls* not *tokens*. So the custom Supabase-backed quota middleware has no built-in replacement and stays. `modelCallLimitMiddleware({ runLimit: 2, exitBehavior: 'end' })` cleanly replaces the old `stepCountIs(2)` per-request step cap. `modelRetryMiddleware` and `modelFallbackMiddleware` are optional resilience add-ons that fit the multi-provider setup.

**Short-circuit requirement:** custom guards must short-circuit with a canned assistant message (not throw). The exact `beforeModel` short-circuit primitive (return a state update + jump to end) is confirmed in Phase 2 before building on it. `modelCallLimitMiddleware` uses `exitBehavior: 'end'` (graceful) rather than `'error'` (which throws `ModelCallLimitMiddlewareError`).

## Request Flow

```
browser (CopilotChat) -> POST /api/copilotkit -> CopilotRuntime (AG-UI)
  -> buildAgent(provider, model).stream(messages)
     -> [quota middleware]      exhausted? -> canned message + stop
     -> [moderation middleware] every N msgs off-topic? -> warn/block canned + stop
     -> LLM (+ navigate tool call) -> token stream
     -> [persistence middleware] persist usage to Supabase
  -> AG-UI stream -> CopilotChat renders; navigate tool -> frontend action -> scrollTo(section)
```

## Frontend

- Wrap the app (or the chat surface) in `<CopilotKit runtimeUrl="/api/copilotkit">`.
- Use the **prebuilt** `<CopilotChat>` for the transcript + input, themed toward the terminal look via CopilotKit CSS variables.
- `navigate` is registered as a **frontend action** (`useCopilotAction`) whose handler calls `scrollTo(section)`. This removes the current `output-available` polling in `chat.tsx`.
- Peripheral features live as custom UI around the prebuilt chat:
  - multi-provider model selector -> external control that sets the request's `provider`/`model` (passed through CopilotKit context/body)
  - quota banner + token usage bar -> reads from `/api/quota` (unchanged) and/or streamed metadata
  - session history panel -> unchanged, backed by `/api/sessions` + `/api/history`
  - slash commands (`/about`, `/lang`, `/theme`, `/filter`, ...) -> handled client-side outside the transcript, or re-implemented as frontend actions
  - navigation quips -> injected as assistant messages (existing `/api/quip` behavior)

If theming the prebuilt chat toward the terminal look proves too costly, the fallback is CopilotKit headless hooks (`useCopilotChat`) — deferred, not part of this scope.

## Providers / Models

- `lib/agent/models.ts` replaces the old `getModel()`.
- `lib/models.ts` (UI catalog) is unchanged; `provider`/`model` flow from the selector into the request and into `buildAgent`.
- The agent is built per request with the chosen model (`createAgent` is cheap to construct; the system is stateless).

## Observability

Replace manual OTEL spans (`@langfuse/tracing`, `@langfuse/otel`, `@opentelemetry/*`, `instrumentation.ts`, `lib/otel.ts`) with the LangChain Langfuse `CallbackHandler` (`lib/tracing/langfuse.ts`), passed via `callbacks`. This removes hand-rolled span lifecycle code from the routes. `instrumentation.ts` and `lib/otel.ts` are removed once nothing references them.

## Dependencies

- **Add:** `langchain`, `@langchain/core`, `@langchain/anthropic`, `@langchain/openai`, `@copilotkit/react-core`, `@copilotkit/react-ui`, `@copilotkit/runtime`, `langfuse-langchain`
- **Remove:** `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/react`, `@langfuse/otel`, `@langfuse/tracing`, `@opentelemetry/sdk-node`, `@opentelemetry/sdk-trace-node`, `@opentelemetry/api`

## Testing

- Keep Vitest. Unit-test the pure/isolated modules: `lib/agent/models.ts` (correct model instance per provider), the middleware decision logic (reusing existing `moderation.test.ts` / `quota.test.ts` helpers), and `lib/quip/quip.ts` prompt building.
- The existing `lib/chat/*.test.ts` stay valid because those helpers are preserved.
- Integration verification is manual (drive the chat end-to-end): streaming, navigate, quota exhaustion, off-topic warn/block, quip, per provider.

## Phasing

1. **Foundation** — `lib/agent/{models,system-prompt,agent}`; a temporary route to confirm `createAgent` streaming + `navigate` tool + multi-provider works.
2. **Guards** — port quota + moderation to middleware; confirm short-circuit canned responses and usage persistence; wire `modelCallLimitMiddleware`.
3. **Runtime + frontend** — mount `CopilotRuntime`; rewrite `chat.tsx` with prebuilt themed chat; `navigate` as frontend action; peripheral UI (quota/model/history).
4. **Quip + tracing** — swap quip to LangChain; swap Langfuse to `CallbackHandler`.
5. **Cleanup** — remove AI SDK + OTEL deps; delete `app/api/chat/route.ts`; update tests; verify the whole flow; Dockerfile check.

## Risks

- **In-process AG-UI path in JS is less documented** than the LangGraph-server path. Mitigation: validate in Phase 3 early; fall back to a separate LangGraph server (dockerized alongside Next.js) if the in-process adapter proves unworkable.
- **Middleware short-circuit primitive** — confirm the exact `beforeModel` mechanism to return a canned message and end, before building both guards on it (Phase 2).
- **Prebuilt UI theming** — the terminal aesthetic will be approximated, not pixel-identical. Fallback: headless hooks (out of scope).
- **Free models + tool calls / structured output via LangChain** — verify per provider; the current code already strips leaked tool-call JSON from text, which may still be needed.
- **Dependency churn** — large `package.json` change; do the add/remove in Phase 5 after the new path works, so rollback stays easy.
