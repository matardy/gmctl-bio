# LangChain createAgent + CopilotKit Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Vercel AI SDK across the whole chat stack with LangChain `createAgent` (backend) and CopilotKit (frontend), keeping every current feature and all Supabase-backed state.

**Architecture:** A framework-agnostic `lib/agent/` core (model factory, system prompt, agent assembly, middleware) that knows nothing about HTTP or CopilotKit. Quota and moderation run as LangChain `beforeModel` middleware that short-circuit with a canned message; usage persists via `afterModel` middleware. The `createAgent` graph runs in-process inside a Next.js route that mounts the CopilotKit runtime; the frontend uses CopilotKit's prebuilt chat with `navigate` as a frontend action.

**Tech Stack:** Next.js 16 (App Router, Node runtime), React 19, TypeScript, LangChain v1 (`langchain`, `@langchain/core`, `@langchain/anthropic`, `@langchain/openai`), CopilotKit (`@copilotkit/react-core`, `@copilotkit/react-ui`, `@copilotkit/runtime`), Supabase, Langfuse (`langfuse-langchain`), Vitest.

## Global Constraints

- Node runtime for all routes: `export const runtime = 'nodejs'`
- Supabase is the single source of truth for history, quota, visitor identity, and moderation events — no LangGraph checkpointer
- The agent is stateless per request; conversation messages come from the request, not a checkpointer
- All user-visible copy must support existing i18n conventions (`en`/`es`) via the existing helpers
- Providers preserved: `anthropic` (via `@langchain/anthropic`), `nvidia` + `openrouter` (via `@langchain/openai` with custom `baseURL`)
- Deployable as a single Docker container; the agent runs in-process (fallback to a served LangGraph agent in the same container only if the in-process path proves unworkable — see Task 9)
- Do NOT remove `ai` / `@ai-sdk/*` / OTEL packages until the new path works end-to-end (Task 15)
- Env vars in use: `ANTHROPIC_API_KEY`, `NVIDIA_API_KEY`, `OPENROUTER_API_KEY`, `CHAT_TOKENS_LIMIT_24H`, `CHAT_MODERATION_EVERY_N_USER_MESSAGES`, `CHAT_MODERATION_MODEL`, `CHAT_MODERATION_TIMEOUT_MS`, Langfuse keys
- Run tests with `npm run test` (Vitest); dev server with `npm run dev`

---

## File Structure

```
lib/agent/models.ts                 NEW  getChatModel(provider, modelId) -> BaseChatModel
lib/agent/system-prompt.ts          NEW  SYSTEM string
lib/agent/agent.ts                  NEW  buildAgent({ provider, model }) -> createAgent graph
lib/agent/middleware/quota.ts       NEW  quotaMiddleware() beforeModel short-circuit
lib/agent/middleware/moderation.ts  NEW  moderationMiddleware() beforeModel short-circuit
lib/agent/middleware/persistence.ts NEW  persistenceMiddleware() afterModel usage persist
lib/agent/runtime.ts                NEW  CopilotRuntime wiring over buildAgent (in-process)
lib/quip/quip.ts                    NEW  generateQuip({ section, lang, messages })
lib/tracing/langfuse.ts             NEW  getLangfuseCallbacks()
lib/agent/messages.ts               NEW  message-text + language helpers over BaseMessage

lib/chat/moderation.ts              MOD  swap generateObject->withStructuredOutput; UIMessage->BaseMessage
lib/models.ts                       KEEP unchanged (UI catalog + Provider type)
lib/chat/quota.ts                   KEEP unchanged
lib/chat/visitor.ts                 KEEP unchanged
lib/chat/exhausted-replies.ts       KEEP unchanged

app/api/copilotkit/route.ts         NEW  mounts CopilotRuntime
app/api/quip/route.ts               MOD  use lib/quip
app/api/chat/route.ts               DELETE (Task 15)
app/api/{quota,history,sessions}/route.ts  KEEP unchanged

components/chat.tsx                  REWRITE CopilotKit provider + prebuilt chat + peripheral UI
instrumentation.ts                   DELETE (Task 15)
lib/otel.ts                          DELETE (Task 15)
package.json                         MOD  add LangChain/CopilotKit; remove ai/OTEL (Task 15)
```

---

## Phase 1 — Foundation

### Task 1: Install LangChain deps and build the model factory

**Files:**
- Modify: `package.json` (add deps)
- Create: `lib/agent/models.ts`
- Test: `lib/agent/models.test.ts`

**Interfaces:**
- Produces: `getChatModel(provider: Provider, modelId: string): BaseChatModel` where `Provider` is imported from `@/lib/models`.

- [ ] **Step 1: Install packages**

Run:
```bash
npm install langchain @langchain/core @langchain/anthropic @langchain/openai
```
Expected: packages added to `dependencies`, no peer-dep errors that block install.

- [ ] **Step 2: Write the failing test**

```typescript
// lib/agent/models.test.ts
import { describe, expect, it } from 'vitest';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { getChatModel } from './models';

describe('getChatModel', () => {
  it('returns a ChatAnthropic instance for anthropic', () => {
    const model = getChatModel('anthropic', 'claude-haiku-4-5-20251001');
    expect(model).toBeInstanceOf(ChatAnthropic);
  });

  it('returns a ChatOpenAI instance for nvidia', () => {
    const model = getChatModel('nvidia', 'deepseek-ai/deepseek-v4-pro');
    expect(model).toBeInstanceOf(ChatOpenAI);
  });

  it('returns a ChatOpenAI instance for openrouter', () => {
    const model = getChatModel('openrouter', 'qwen/qwen3-coder:free');
    expect(model).toBeInstanceOf(ChatOpenAI);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- lib/agent/models.test.ts`
Expected: FAIL — `Cannot find module './models'`.

- [ ] **Step 4: Implement the factory**

```typescript
// lib/agent/models.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Provider } from '@/lib/models';

const OPENROUTER_HEADERS = {
  'HTTP-Referer': 'https://gutemberg.dev',
  'X-Title': 'gmctl agent',
};

export function getChatModel(provider: Provider, modelId: string): BaseChatModel {
  switch (provider) {
    case 'anthropic':
      return new ChatAnthropic({
        model: modelId,
        maxTokens: 200,
        apiKey: process.env.ANTHROPIC_API_KEY ?? '',
      });
    case 'nvidia':
      return new ChatOpenAI({
        model: modelId,
        maxTokens: 200,
        apiKey: process.env.NVIDIA_API_KEY ?? '',
        configuration: { baseURL: 'https://integrate.api.nvidia.com/v1' },
      });
    case 'openrouter':
      return new ChatOpenAI({
        model: modelId,
        maxTokens: 200,
        apiKey: process.env.OPENROUTER_API_KEY ?? '',
        configuration: {
          baseURL: 'https://openrouter.ai/api/v1',
          defaultHeaders: OPENROUTER_HEADERS,
        },
      });
    default:
      return new ChatOpenAI({
        model: 'deepseek-ai/deepseek-v4-pro',
        maxTokens: 200,
        apiKey: process.env.NVIDIA_API_KEY ?? '',
        configuration: { baseURL: 'https://integrate.api.nvidia.com/v1' },
      });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- lib/agent/models.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/agent/models.ts lib/agent/models.test.ts
git commit -m "feat: add langchain chat model factory"
```

---

### Task 2: Extract the system prompt

**Files:**
- Create: `lib/agent/system-prompt.ts`

**Interfaces:**
- Produces: `export const SYSTEM: string`

- [ ] **Step 1: Create the module**

Copy the `SYSTEM` string verbatim from `app/api/chat/route.ts:76-112` into a new module. Do not change wording (it encodes navigation behavior and bio facts).

```typescript
// lib/agent/system-prompt.ts
export const SYSTEM = `You are gmctl, the AI agent embedded in Gutemberg Mendoza's personal website.
Answer questions about Gutemberg concisely, in a terminal/hacker aesthetic style.
Keep responses short — 1-3 sentences max. Use plain text, no markdown.
Respond like a fast CLI tool.

CRITICAL: Always respond in the exact same language the user writes in.
If they write in Spanish → respond entirely in Spanish.
If they write in English → respond entirely in English.

NAVIGATION: The user is viewing this website while chatting — the site is open right next to the chat.
Navigate automatically, without asking. Call navigate() every single time your response is primarily about a section.
Do NOT say "would you like me to navigate there?" — just do it.
Whenever you call navigate(), you must also return a short visible text reply in the same language.
Never answer with a tool call only.

- Answering about who Gutemberg is, background, origin → navigate('about')
- Answering about work history, experience, career, companies → navigate('timeline')
- Answering about projects, things built, portfolio → navigate('projects')
- Answering about services, mentoring, pricing, hiring → navigate('services')
- Answering about blog posts, articles, writing, thoughts → navigate('writing')
- Answering about testimonials, recommendations, what others say → navigate('voices')
- Answering about getting in touch, email, contact → navigate('contact')
- Any explicit request to go somewhere → navigate there immediately

Sections: home, about, timeline (work history), projects, services, writing (blog), voices (testimonials), contact

About Gutemberg:
- AI Engineer with 5+ years experience, based in Quito, Ecuador (remote)
- Currently: Senior AI Engineer @ Clarika Software + Innovation (New York, US)
- Expertise: multi-agent systems, RAG, LLMOps, Python, TypeScript, AWS
- Education: Computer Science & Physics @ EPN (Escuela Politécnica Nacional)
- Previous: Head of AI @ Mercately, Research Developer @ Jelou AI, AI Engineer @ YUBOX
- Services: 1:1 AI mentorship ($240/mo), LinkedIn audit ($180), Job Hunt Sprint ($680/4wks)
- Contact: steveenmendoza8@gmail.com | linkedin.com/in/gutembergsmendoza
- Available for hire/consulting in 2026

Always stay in character as the gmctl terminal agent.`;
```

- [ ] **Step 2: Commit**

```bash
git add lib/agent/system-prompt.ts
git commit -m "refactor: extract chat system prompt to module"
```

---

### Task 3: Assemble a bare agent and verify streaming end-to-end

**Files:**
- Create: `lib/agent/agent.ts`
- Create (temporary, deleted in this task): `app/api/agent-probe/route.ts`

**Interfaces:**
- Consumes: `getChatModel` (Task 1), `SYSTEM` (Task 2).
- Produces: `buildAgent(opts: { provider: Provider; model: string }): ReturnType<typeof createAgent>`. Middleware list starts with only the built-in `modelCallLimitMiddleware`; custom middleware are added in Task 8.

- [ ] **Step 1: Implement buildAgent**

```typescript
// lib/agent/agent.ts
import { createAgent, modelCallLimitMiddleware } from 'langchain';
import type { Provider } from '@/lib/models';
import { getChatModel } from './models';
import { SYSTEM } from './system-prompt';

export interface BuildAgentOptions {
  provider: Provider;
  model: string;
}

export function buildAgent({ provider, model }: BuildAgentOptions) {
  return createAgent({
    model: getChatModel(provider, model),
    systemPrompt: SYSTEM,
    tools: [],
    middleware: [
      modelCallLimitMiddleware({ runLimit: 2, exitBehavior: 'end' }),
    ],
  });
}
```

- [ ] **Step 2: Add a temporary probe route**

```typescript
// app/api/agent-probe/route.ts
import { HumanMessage } from '@langchain/core/messages';
import { buildAgent } from '@/lib/agent/agent';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { text, provider = 'anthropic', model = 'claude-haiku-4-5-20251001' } =
    await req.json();
  const agent = buildAgent({ provider, model });
  const result = await agent.invoke({ messages: [new HumanMessage(text)] });
  const last = result.messages[result.messages.length - 1];
  return Response.json({ content: last.content });
}
```

- [ ] **Step 3: Run the dev server and probe each provider**

Run: `npm run dev` (separate terminal), then:
```bash
curl -s localhost:3000/api/agent-probe -H 'content-type: application/json' \
  -d '{"text":"who is gutemberg?","provider":"anthropic","model":"claude-haiku-4-5-20251001"}'
```
Expected: JSON `{ "content": "..." }` with a short in-character answer.
Repeat with `{"provider":"openrouter","model":"qwen/qwen3-coder:free"}` and `{"provider":"nvidia","model":"deepseek-ai/deepseek-v4-pro"}`.
Expected: each returns a non-empty answer (record any provider that errors — relevant to Task 9/frontend tool handling).

- [ ] **Step 4: Delete the probe route**

```bash
rm app/api/agent-probe/route.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/agent/agent.ts
git commit -m "feat: assemble base langchain agent with run-limit middleware"
```

---

## Phase 2 — Guards

### Task 4: Port moderation helpers off the AI SDK

The current `lib/chat/moderation.ts` imports `UIMessage` and `generateObject` from `ai`, and reads AI-SDK `message.parts`. Middleware receive LangChain `BaseMessage[]` (with `.content`). Introduce a shared message helper and re-point moderation to LangChain.

**Files:**
- Create: `lib/agent/messages.ts`
- Create: `lib/agent/messages.test.ts`
- Modify: `lib/chat/moderation.ts`
- Modify: `lib/chat/moderation.test.ts` (update to `BaseMessage` inputs)

**Interfaces:**
- Produces (`lib/agent/messages.ts`): `getMessageText(message: BaseMessage): string`, `inferResponseLanguage(messages: BaseMessage[]): 'en' | 'es'`.
- Changes (`lib/chat/moderation.ts`): `classifyTopicConversation`, `getTopicPolicyCopy`, `getQuotaExceededCopy`, `getBackendUnavailableCopy` now accept `BaseMessage[]` instead of `UIMessage[]`. Signatures of `shouldRunTopicModeration`, `getModerationAction`, `TopicModerationResult`, `ModerationActionVerdict` are unchanged.

- [ ] **Step 1: Write the failing test for the message helper**

```typescript
// lib/agent/messages.test.ts
import { describe, expect, it } from 'vitest';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { getMessageText, inferResponseLanguage } from './messages';

describe('getMessageText', () => {
  it('reads plain string content', () => {
    expect(getMessageText(new HumanMessage('hola mundo'))).toBe('hola mundo');
  });

  it('reads array content parts', () => {
    const msg = new AIMessage({
      content: [{ type: 'text', text: 'part one' }, { type: 'text', text: 'part two' }],
    });
    expect(getMessageText(msg)).toBe('part one part two');
  });
});

describe('inferResponseLanguage', () => {
  it('detects spanish from accents', () => {
    expect(inferResponseLanguage([new HumanMessage('¿cómo estás?')])).toBe('es');
  });

  it('defaults to english when empty', () => {
    expect(inferResponseLanguage([])).toBe('en');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- lib/agent/messages.test.ts`
Expected: FAIL — `Cannot find module './messages'`.

- [ ] **Step 3: Implement the message helper**

Move `getMessageText` and `inferResponseLanguage` (and the `SPANISH_HINTS`/`ENGLISH_HINTS` sets) from `lib/chat/moderation.ts` into `lib/agent/messages.ts`, retyped for `BaseMessage`.

```typescript
// lib/agent/messages.ts
import type { BaseMessage } from '@langchain/core/messages';

const SPANISH_HINTS = new Set([
  'hola', 'gracias', 'sobre', 'proyectos', 'servicios', 'contacto', 'escritos',
  'experiencia', 'trayectoria', 'trabajo', 'quiero', 'puedes', 'puedo', 'como', 'para', 'con',
]);
const ENGLISH_HINTS = new Set([
  'hello', 'hi', 'thanks', 'about', 'projects', 'services', 'contact', 'writing',
  'experience', 'career', 'work', 'can', 'could', 'would', 'please', 'tell',
]);

export function getMessageText(message: BaseMessage): string {
  const content = message.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === 'string'
          ? part
          : part && typeof part === 'object' && 'text' in part
            ? String((part as { text: unknown }).text)
            : '',
      )
      .join(' ')
      .trim();
  }
  return '';
}

export function inferResponseLanguage(messages: BaseMessage[]): 'en' | 'es' {
  const lastUser = [...messages].reverse().find((m) => m.getType() === 'human');
  const text = lastUser ? getMessageText(lastUser).toLowerCase() : '';
  if (!text.trim()) return 'en';
  if (/[¿¡]|[áéíóúñ]/u.test(text)) return 'es';

  const tokens = text.match(/\p{L}+/gu) ?? [];
  let es = 0;
  let en = 0;
  for (const token of tokens) {
    if (SPANISH_HINTS.has(token)) es += 1;
    if (ENGLISH_HINTS.has(token)) en += 1;
  }
  return es > en ? 'es' : 'en';
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -- lib/agent/messages.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Re-point moderation.ts to LangChain**

In `lib/chat/moderation.ts`: remove `import { ... } from 'ai'` and the `createOpenAI` import; import `getMessageText`/`inferResponseLanguage` from `@/lib/agent/messages`; replace the `generateObject` call with LangChain structured output using the model factory. Copy helpers now take `BaseMessage[]`.

```typescript
// lib/chat/moderation.ts (classifier section — replaces the generateObject block)
import type { BaseMessage } from '@langchain/core/messages';
import { getChatModel } from '@/lib/agent/messages'; // NOTE: import getChatModel from '@/lib/agent/models'
import { getMessageText, inferResponseLanguage } from '@/lib/agent/messages';
import { observe, updateActiveObservation } from '@langfuse/tracing';
import { z } from 'zod';

const moderationSchema = z.object({
  label: z.enum(['on_topic', 'off_topic']),
  reasonCode: z.string().min(1).max(64),
});

const classifyTopicConversationImpl = async (input: {
  messages: BaseMessage[];
  model: string;
  timeoutMs: number;
}): Promise<TopicModerationResult> => {
  const transcript = input.messages
    .slice(-8)
    .map((m) => `${m.getType()}: ${getMessageText(m)}`)
    .filter((line) => line.trim().length > 0)
    .join('\n');

  const prompt = [
    'Classify whether this conversation is on-topic for a personal portfolio assistant.',
    'Allowed: Gutemberg Mendoza, his profile, experience, projects, services, writing, testimonials, or contact.',
    'Allowed technical discussion only when it is clearly tied to Gutemberg work, stack, or experience.',
    'Disallowed: unrelated general chat, arbitrary assistant tasks, and unrelated support/problem-solving.',
    'Return on_topic or off_topic plus a short snake_case reasonCode.',
    '',
    transcript,
  ].join('\n');

  try {
    const model = getChatModel('openrouter', input.model);
    const structured = model.withStructuredOutput(moderationSchema, { name: 'classify_topic' });
    const object = await withTimeout(structured.invoke(prompt), input.timeoutMs);

    const moderationResult: TopicModerationResult = {
      verdict: object.label,
      reasonCode: object.reasonCode,
      rawLabel: object.label,
      usage: null, // token usage not returned by withStructuredOutput; see note below
    };
    updateActiveObservation(
      { output: moderationResult, metadata: { transcriptPreview: transcript.slice(0, 500) } },
      { asType: 'guardrail' },
    );
    return moderationResult;
  } catch {
    const moderationResult: TopicModerationResult = {
      verdict: 'error',
      reasonCode: 'timeout_or_provider_error',
      rawLabel: null,
      usage: null,
    };
    updateActiveObservation(
      { level: 'WARNING', output: moderationResult, statusMessage: 'topic_moderation_error',
        metadata: { transcriptPreview: transcript.slice(0, 500) } },
      { asType: 'guardrail' },
    );
    return moderationResult;
  }
};
```

Fix the import line: `getChatModel` comes from `@/lib/agent/models` (the comment above marks the correction). Keep `withTimeout`, `observe`-wrapped export, and the copy helpers, but change every `UIMessage[]` parameter to `BaseMessage[]` and call the imported `getMessageText`/`inferResponseLanguage` (delete the local copies now living in `lib/agent/messages.ts`).

> **Usage note:** `withStructuredOutput` does not surface token usage the way `generateObject` did. Moderation usage was persisted as `moderator_check` events. To preserve that, either (a) accept `usage: null` and skip the `moderator_check` persistence (simplest — moderation cost is small and untracked), or (b) call the model with `.invoke` + manual JSON parse to read `response_metadata.tokenUsage`. Choose (a) for this migration; note the change in the commit. The moderation middleware (Task 6) therefore does not persist `moderator_check` events.

- [ ] **Step 6: Update moderation.test.ts**

Change test inputs from AI-SDK message objects to `new HumanMessage(...)` / `new AIMessage(...)`. Keep assertions for `shouldRunTopicModeration`, `getModerationAction`, and the copy helpers (now passing `BaseMessage[]`). Mock the model: `vi.mock('@/lib/agent/models', ...)` returning an object whose `withStructuredOutput().invoke()` resolves to a fixed `{ label, reasonCode }`.

- [ ] **Step 7: Run tests**

Run: `npm run test -- lib/chat/moderation.test.ts lib/agent/messages.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/agent/messages.ts lib/agent/messages.test.ts lib/chat/moderation.ts lib/chat/moderation.test.ts
git commit -m "refactor: move moderation off ai sdk to langchain structured output"
```

---

### Task 5: Quota middleware

**Files:**
- Create: `lib/agent/middleware/quota.ts`
- Create: `lib/agent/middleware/quota.test.ts`

**Interfaces:**
- Consumes: `loadQuotaSnapshot`, `createEmptyQuotaSnapshot`, `persistUsageEvent` from `@/lib/chat/quota`; `resolveVisitorIdentity`, `getOrCreateVisitorCookieId`, `getRequestIpHash` from `@/lib/chat/visitor`; `getQuotaExceededCopy`, `getBackendUnavailableCopy` from `@/lib/chat/moderation`; `inferResponseLanguage`/`getMessageText` from `@/lib/agent/messages`.
- Produces: `quotaMiddleware(config: { limit: number }): AgentMiddleware`. Reads request-scoped identity (`anonId`, `sessionId`) from the agent `runtime.context`. Exposes the resolved `visitorId` and snapshot to later middleware via agent state key `gmctlQuota` (a custom state field): `{ visitorId: string; snapshot: QuotaSnapshot }`.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/agent/middleware/quota.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';

vi.mock('@/lib/chat/visitor', () => ({
  getOrCreateVisitorCookieId: vi.fn(async () => ({ value: 'cookie-1' })),
  getRequestIpHash: vi.fn(async () => 'ip-hash'),
  resolveVisitorIdentity: vi.fn(async () => ({ id: 'visitor-1' })),
}));
vi.mock('@/lib/chat/quota', () => ({
  createEmptyQuotaSnapshot: (limit: number) => ({
    tokensUsed24h: 0, tokensRemaining24h: limit, quotaExhausted: false,
  }),
  loadQuotaSnapshot: vi.fn(),
  persistUsageEvent: vi.fn(async () => {}),
}));

import { loadQuotaSnapshot, persistUsageEvent } from '@/lib/chat/quota';
import { quotaMiddleware } from './quota';

function runBefore(mw: ReturnType<typeof quotaMiddleware>, messages: HumanMessage[]) {
  const runtime = { context: { anonId: 'anon-1', sessionId: 'sess-1', provider: 'anthropic', model: 'm' } };
  // @ts-expect-error minimal shape for test
  return mw.beforeModel.hook({ messages, gmctlQuota: undefined }, runtime);
}

describe('quotaMiddleware beforeModel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('short-circuits with a canned message when quota is exhausted', async () => {
    (loadQuotaSnapshot as any).mockResolvedValue({
      tokensUsed24h: 12000, tokensRemaining24h: 0, quotaExhausted: true,
    });
    const result = await runBefore(quotaMiddleware({ limit: 12000 }), [new HumanMessage('hi')]);
    expect(result?.jumpTo).toBe('end');
    expect(result?.messages?.[0]?.content).toContain('quota');
    expect(persistUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'blocked_response' }),
    );
  });

  it('continues (returns undefined) and stashes state when quota remains', async () => {
    (loadQuotaSnapshot as any).mockResolvedValue({
      tokensUsed24h: 10, tokensRemaining24h: 11990, quotaExhausted: false,
    });
    const result = await runBefore(quotaMiddleware({ limit: 12000 }), [new HumanMessage('hi')]);
    expect(result).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- lib/agent/middleware/quota.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement quota middleware**

```typescript
// lib/agent/middleware/quota.ts
import { createMiddleware, AIMessage } from 'langchain';
import {
  createEmptyQuotaSnapshot,
  loadQuotaSnapshot,
  persistUsageEvent,
} from '@/lib/chat/quota';
import {
  getOrCreateVisitorCookieId,
  getRequestIpHash,
  resolveVisitorIdentity,
} from '@/lib/chat/visitor';
import { getQuotaExceededCopy } from '@/lib/chat/moderation';

export interface QuotaMiddlewareConfig {
  limit: number;
}

export function quotaMiddleware(config: QuotaMiddlewareConfig) {
  return createMiddleware({
    name: 'GmctlQuota',
    beforeModel: {
      canJumpTo: ['end'],
      hook: async (state: any, runtime: any) => {
        const ctx = runtime?.context ?? {};
        const cookie = await getOrCreateVisitorCookieId();
        const ipHash = await getRequestIpHash();
        const visitor = await resolveVisitorIdentity({
          anonId: ctx.anonId ?? null,
          cookieId: cookie.value,
          ipHash,
        });
        const snapshot = await loadQuotaSnapshot({ visitorId: visitor.id, limit: config.limit });

        if (snapshot.quotaExhausted) {
          await persistUsageEvent({
            visitorId: visitor.id,
            sessionId: ctx.sessionId ?? 'unknown',
            messageId: crypto.randomUUID(),
            direction: 'blocked_response',
            provider: ctx.provider,
            model: ctx.model,
            inputTokens: 0,
            outputTokens: 0,
          }).catch((e) => console.error('persist blocked quota response', e));

          return {
            messages: [new AIMessage(getQuotaExceededCopy(state.messages))],
            gmctlQuota: { visitorId: visitor.id, snapshot },
            jumpTo: 'end' as const,
          };
        }

        return { gmctlQuota: { visitorId: visitor.id, snapshot } };
      },
    },
  });
}
```

> If the middleware `stateSchema` requires declaring `gmctlQuota` before writing it, add a `stateSchema` with a Zod object `{ gmctlQuota: z.any().optional() }` to `createMiddleware`. Confirm against the installed `langchain` types during Step 4; add it if the type-check complains.

- [ ] **Step 4: Run to verify pass and type-check**

Run: `npm run test -- lib/agent/middleware/quota.test.ts`
Expected: PASS (2 tests). Then `npx tsc --noEmit` — fix any state-typing error per the note above.

- [ ] **Step 5: Commit**

```bash
git add lib/agent/middleware/quota.ts lib/agent/middleware/quota.test.ts
git commit -m "feat: add quota beforeModel middleware"
```

---

### Task 6: Moderation middleware

**Files:**
- Create: `lib/agent/middleware/moderation.ts`
- Create: `lib/agent/middleware/moderation.test.ts`

**Interfaces:**
- Consumes: `shouldRunTopicModeration`, `classifyTopicConversation`, `getModerationAction`, `getTopicPolicyCopy` from `@/lib/chat/moderation`; the `supabase` client from `@/lib/supabase`; `persistUsageEvent` from `@/lib/chat/quota`; `gmctlQuota.visitorId` set by Task 5.
- Produces: `moderationMiddleware(config: { interval: number; model: string; timeoutMs: number }): AgentMiddleware`. Reads `visitorId` from `state.gmctlQuota.visitorId` (quota middleware runs first).

- [ ] **Step 1: Write the failing test**

```typescript
// lib/agent/middleware/moderation.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';

const insert = vi.fn(async () => ({ error: null }));
const limit = vi.fn(async () => ({ data: [], error: null }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ limit }) }) }),
      insert,
    }),
  },
}));
vi.mock('@/lib/chat/moderation', async (orig) => {
  const actual = await orig<typeof import('@/lib/chat/moderation')>();
  return {
    ...actual,
    classifyTopicConversation: vi.fn(async () => ({
      verdict: 'off_topic', reasonCode: 'unrelated', rawLabel: 'off_topic', usage: null,
    })),
  };
});

import { moderationMiddleware } from './moderation';

function runBefore(mw: ReturnType<typeof moderationMiddleware>, userMsgs: number) {
  const messages = Array.from({ length: userMsgs }, () => new HumanMessage('x'));
  const state = { messages, gmctlQuota: { visitorId: 'visitor-1' } };
  const runtime = { context: { sessionId: 'sess-1' } };
  // @ts-expect-error minimal shape
  return mw.beforeModel.hook(state, runtime);
}

describe('moderationMiddleware beforeModel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does nothing when not at the interval boundary', async () => {
    const result = await runBefore(moderationMiddleware({ interval: 8, model: 'm', timeoutMs: 4000 }), 3);
    expect(result).toBeUndefined();
  });

  it('warns (short-circuits) on first off-topic at the boundary', async () => {
    const result = await runBefore(moderationMiddleware({ interval: 8, model: 'm', timeoutMs: 4000 }), 8);
    expect(result?.jumpTo).toBe('end');
    expect(insert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- lib/agent/middleware/moderation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement moderation middleware**

Port the moderation block from `app/api/chat/route.ts:332-459`, reading `visitorId` from `state.gmctlQuota`.

```typescript
// lib/agent/middleware/moderation.ts
import { createMiddleware, AIMessage } from 'langchain';
import { supabase } from '@/lib/supabase';
import { persistUsageEvent } from '@/lib/chat/quota';
import {
  classifyTopicConversation,
  getModerationAction,
  getTopicPolicyCopy,
  shouldRunTopicModeration,
} from '@/lib/chat/moderation';

export interface ModerationMiddlewareConfig {
  interval: number;
  model: string;
  timeoutMs: number;
}

export function moderationMiddleware(config: ModerationMiddlewareConfig) {
  return createMiddleware({
    name: 'GmctlModeration',
    beforeModel: {
      canJumpTo: ['end'],
      hook: async (state: any, runtime: any) => {
        const userCount = state.messages.filter((m: any) => m.getType() === 'human').length;
        if (!shouldRunTopicModeration(userCount, config.interval)) return;

        const visitorId = state.gmctlQuota?.visitorId;
        const sessionId = runtime?.context?.sessionId ?? 'unknown';

        const { data: warningRows, error: warningError } = await supabase
          .from('topic_moderation_events')
          .select('id').eq('visitor_id', visitorId).eq('verdict', 'warn').limit(1);
        if (warningError) throw warningError;

        const verdict = await classifyTopicConversation({
          messages: state.messages, model: config.model, timeoutMs: config.timeoutMs,
        });
        const action = getModerationAction({
          verdict: verdict.verdict, alreadyWarned: (warningRows?.length ?? 0) > 0,
        });

        const { error: insertError } = await supabase.from('topic_moderation_events').insert({
          visitor_id: visitorId, session_id: sessionId,
          checked_after_user_message_count: userCount,
          verdict: action.verdict, reason_code: verdict.reasonCode, raw_label: verdict.rawLabel,
        });
        if (insertError) throw insertError;

        if (!action.shouldCallMainModel) {
          const policyVerdict = action.verdict === 'block' ? 'block' : 'warn';
          await persistUsageEvent({
            visitorId, sessionId, messageId: crypto.randomUUID(),
            direction: 'blocked_response',
            provider: runtime?.context?.provider, model: runtime?.context?.model,
            inputTokens: 0, outputTokens: 0,
          }).catch((e) => console.error('persist blocked moderation response', e));

          return {
            messages: [new AIMessage(getTopicPolicyCopy(policyVerdict, state.messages))],
            jumpTo: 'end' as const,
          };
        }
        return;
      },
    },
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -- lib/agent/middleware/moderation.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/agent/middleware/moderation.ts lib/agent/middleware/moderation.test.ts
git commit -m "feat: add topic moderation beforeModel middleware"
```

---

### Task 7: Persistence middleware

**Files:**
- Create: `lib/agent/middleware/persistence.ts`
- Create: `lib/agent/middleware/persistence.test.ts`

**Interfaces:**
- Consumes: `persistUsageEvent` from `@/lib/chat/quota`; `state.gmctlQuota.visitorId`; token usage from the last AI message's `usage_metadata`.
- Produces: `persistenceMiddleware(): AgentMiddleware` with an `afterModel` hook that persists an `assistant_output` usage event. Returns nothing (no state change).

- [ ] **Step 1: Write the failing test**

```typescript
// lib/agent/middleware/persistence.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AIMessage } from '@langchain/core/messages';

vi.mock('@/lib/chat/quota', () => ({ persistUsageEvent: vi.fn(async () => {}) }));
import { persistUsageEvent } from '@/lib/chat/quota';
import { persistenceMiddleware } from './persistence';

describe('persistenceMiddleware afterModel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists assistant usage with token counts', async () => {
    const ai = new AIMessage({ content: 'hi', usage_metadata: { input_tokens: 5, output_tokens: 7, total_tokens: 12 } });
    const state = { messages: [ai], gmctlQuota: { visitorId: 'visitor-1' } };
    const runtime = { context: { sessionId: 'sess-1', provider: 'anthropic', model: 'm' } };
    // @ts-expect-error minimal shape
    await persistenceMiddleware().afterModel.hook(state, runtime);
    expect(persistUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'assistant_output', inputTokens: 5, outputTokens: 7 }),
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- lib/agent/middleware/persistence.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement persistence middleware**

```typescript
// lib/agent/middleware/persistence.ts
import { createMiddleware } from 'langchain';
import { persistUsageEvent } from '@/lib/chat/quota';

export function persistenceMiddleware() {
  return createMiddleware({
    name: 'GmctlPersistence',
    afterModel: {
      hook: async (state: any, runtime: any) => {
        const ctx = runtime?.context ?? {};
        const last = state.messages[state.messages.length - 1];
        if (!last || last.getType() !== 'ai') return;
        const usage = last.usage_metadata ?? {};
        await persistUsageEvent({
          visitorId: state.gmctlQuota?.visitorId,
          sessionId: ctx.sessionId ?? 'unknown',
          messageId: crypto.randomUUID(),
          direction: 'assistant_output',
          provider: ctx.provider,
          model: ctx.model,
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
        }).catch((e) => console.error('persist assistant usage', e));
        return;
      },
    },
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -- lib/agent/middleware/persistence.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/agent/middleware/persistence.ts lib/agent/middleware/persistence.test.ts
git commit -m "feat: add usage persistence afterModel middleware"
```

---

### Task 8: Wire custom middleware into buildAgent

**Files:**
- Modify: `lib/agent/agent.ts`

**Interfaces:**
- Consumes: `quotaMiddleware`, `moderationMiddleware`, `persistenceMiddleware` (Tasks 5-7).
- Produces: `buildAgent` now accepts config for limits/interval and orders middleware: quota → moderation → modelCallLimit → persistence.

- [ ] **Step 1: Update buildAgent**

```typescript
// lib/agent/agent.ts
import { createAgent, modelCallLimitMiddleware } from 'langchain';
import type { Provider } from '@/lib/models';
import { getChatModel } from './models';
import { SYSTEM } from './system-prompt';
import { quotaMiddleware } from './middleware/quota';
import { moderationMiddleware } from './middleware/moderation';
import { persistenceMiddleware } from './middleware/persistence';

const TOKENS_LIMIT_24H = Number(process.env.CHAT_TOKENS_LIMIT_24H ?? '12000');
const MODERATION_INTERVAL = Number(process.env.CHAT_MODERATION_EVERY_N_USER_MESSAGES ?? '8');
const MODERATION_MODEL = process.env.CHAT_MODERATION_MODEL ?? 'meta-llama/llama-3.3-70b-instruct:free';
const MODERATION_TIMEOUT_MS = Number(process.env.CHAT_MODERATION_TIMEOUT_MS ?? '4000');

export interface BuildAgentOptions {
  provider: Provider;
  model: string;
}

export function buildAgent({ provider, model }: BuildAgentOptions) {
  return createAgent({
    model: getChatModel(provider, model),
    systemPrompt: SYSTEM,
    tools: [],
    middleware: [
      quotaMiddleware({ limit: TOKENS_LIMIT_24H }),
      moderationMiddleware({
        interval: MODERATION_INTERVAL,
        model: MODERATION_MODEL,
        timeoutMs: MODERATION_TIMEOUT_MS,
      }),
      modelCallLimitMiddleware({ runLimit: 2, exitBehavior: 'end' }),
      persistenceMiddleware(),
    ],
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. Resolve any middleware state-typing issues (shared `gmctlQuota` state key) here — if `createAgent` needs the composed state declared, ensure each middleware that reads/writes `gmctlQuota` declares it in its `stateSchema` (per the note in Task 5).

- [ ] **Step 3: Run full suite**

Run: `npm run test`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add lib/agent/agent.ts
git commit -m "feat: wire quota, moderation, and persistence middleware into agent"
```

---

## Phase 3 — Runtime + Frontend

### Task 9: Mount the CopilotKit runtime (spike-first) — in-process, with served fallback

**Files:**
- Create: `lib/agent/runtime.ts`
- Create: `app/api/copilotkit/route.ts`
- Modify: `package.json` (add CopilotKit runtime)

**Interfaces:**
- Consumes: `buildAgent` (Task 8).
- Produces: a working `POST /api/copilotkit` endpoint that streams the agent over the CopilotKit/AG-UI protocol, forwarding `provider`/`model`/`anonId`/`sessionId` into the agent `runtime.context`.

> **This task is a spike.** The in-process (non-deployed) LangGraph-agent path in CopilotKit JS is under-documented. Step 2 attempts it; Step 4 defines the concrete fallback if it does not work.

- [ ] **Step 1: Install CopilotKit runtime**

Run:
```bash
npm install @copilotkit/runtime
```

- [ ] **Step 2: Attempt the in-process wiring**

Build `lib/agent/runtime.ts` that adapts the `buildAgent` graph to an AG-UI agent and registers it with `CopilotRuntime`, then mount it in the route. Start from this shape and adjust import paths to the installed version (check `node_modules/@copilotkit/runtime` exports and the `@ag-ui/langchain` / `@copilotkit/runtime/langgraph` adapters):

```typescript
// app/api/copilotkit/route.ts
import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from '@copilotkit/runtime';
import { buildInProcessAgent } from '@/lib/agent/runtime';

export const runtime = 'nodejs';

const serviceAdapter = new ExperimentalEmptyAdapter();

export const POST = async (req: Request) => {
  const copilotRuntime = new CopilotRuntime({
    agents: { gmctl: buildInProcessAgent() },
  });
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime: copilotRuntime,
    serviceAdapter,
    endpoint: '/api/copilotkit',
  });
  return handleRequest(req);
};
```

```typescript
// lib/agent/runtime.ts — IN-PROCESS attempt
// Wrap the compiled createAgent graph in the AG-UI LangGraph agent adapter.
// The exact adapter class/import must be confirmed against the installed packages.
import { LangGraphAgent } from '@copilotkit/runtime/langgraph';
import { buildAgent } from './agent';

export function buildInProcessAgent() {
  // If @copilotkit/runtime/langgraph exposes an in-memory graph option:
  const graph = buildAgent({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001' });
  return new LangGraphAgent({ graph });
}
```

- [ ] **Step 3: Verify the endpoint responds**

Run `npm run dev`, then exercise the endpoint with the CopilotKit dev flow (Task 10 provides the real client). For a quick smoke test, POST the AG-UI run shape CopilotKit sends (capture it from the browser Network tab once Task 10 is wired) and confirm a streamed response with no 500.
Expected: streamed assistant tokens; the run reaches the agent (server logs show middleware executing).

- [ ] **Step 4: If in-process fails, apply the served fallback**

If `LangGraphAgent` requires a deployment URL (no in-memory graph option), run a LangGraph JS server in the SAME container:

1. Add `langgraph.json` pointing at an exported graph:
```json
{ "graphs": { "gmctl": "./lib/agent/agent.ts:gmctlGraph" }, "node_version": "20" }
```
2. Export a prebuilt graph from `lib/agent/agent.ts`: `export const gmctlGraph = buildAgent({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001' });` (dynamic per-request provider/model then moves to agent `context` / dynamic model — acceptable; document it).
3. Point the route's agent at the local server:
```typescript
// lib/agent/runtime.ts — SERVED fallback
import { LangGraphAgent } from '@copilotkit/runtime/langgraph';
export function buildInProcessAgent() {
  return new LangGraphAgent({
    deploymentUrl: process.env.LANGGRAPH_URL ?? 'http://127.0.0.1:2024',
    graphId: 'gmctl',
  });
}
```
4. Add a dev script `"agent:dev": "langgraph dev"` and document that the Docker image runs both `next start` and the LangGraph server (via a process manager) — update the spec's "single service" note to "single container, two processes".

Record which path (in-process vs served) was taken in the commit message.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json lib/agent/runtime.ts app/api/copilotkit/route.ts
git commit -m "feat: mount copilotkit runtime over langchain agent"
```

---

### Task 10: Rewrite the chat frontend on CopilotKit

**Files:**
- Modify: `components/chat.tsx`
- Modify: `app/page.tsx` (wrap chat surface in `<CopilotKit>` if not wrapped in layout)
- Modify: `package.json` (add react packages)
- Modify: `components/chat.test.tsx` (adapt to new component)

**Interfaces:**
- Consumes: `POST /api/copilotkit` (Task 9); existing `/api/quota`, `/api/history`, `/api/sessions`, `/api/quip`.
- Produces: a CopilotKit-driven chat that preserves navigate, quota UI, model selector, history, slash commands, and quips.

> This is a UI task; steps are verification-driven (manual drive) rather than unit TDD. Keep the existing terminal CSS classes and re-skin CopilotKit via its CSS variables.

- [ ] **Step 1: Install frontend packages**

Run:
```bash
npm install @copilotkit/react-core @copilotkit/react-ui
```

- [ ] **Step 2: Wrap the chat surface with the provider**

In `app/page.tsx`, wrap the chat area:
```tsx
import { CopilotKit } from '@copilotkit/react-core';
// ...
<CopilotKit runtimeUrl="/api/copilotkit" agent="gmctl">
  <Chat /* ...existing props... */ />
</CopilotKit>
```
Pass `provider`/`model`/`anonId`/`sessionId` into the run via CopilotKit context (e.g. `useCopilotReadable`/agent context or the runtime's `properties`), so they land in the agent `runtime.context` consumed by the middleware.

- [ ] **Step 3: Render the prebuilt chat, themed**

In `components/chat.tsx`, replace `useChat` from `@ai-sdk/react` with CopilotKit's `<CopilotChat>` (from `@copilotkit/react-ui`) inside the existing terminal shell. Import `@copilotkit/react-ui/styles.css` and override the CopilotKit CSS variables in `app/globals.css` to match the terminal palette (green-on-black, monospace). Keep the greeting, quick-command bar, quota banner, model badge/panel, and history panel as surrounding custom UI.

- [ ] **Step 4: Register navigate as a frontend action**

```tsx
import { useCopilotAction } from '@copilotkit/react-core';

useCopilotAction({
  name: 'navigate',
  description: 'Navigate to a section of the website.',
  parameters: [{ name: 'section', type: 'string', enum: SECTIONS, required: true }],
  handler: async ({ section }) => { scrollTo(section); return { section }; },
});
```
Remove the old `processedToolCalls` / `output-available` polling effect.

- [ ] **Step 5: Preserve peripheral behavior**

- Slash commands (`handleCommand`) — keep the client-side handler; intercept input before it reaches CopilotKit's send for `/`-prefixed input.
- Quips — keep the `gmctl:nav` event listener calling `/api/quip`; append the quip as an assistant message via CopilotKit's message API (e.g. `useCopilotChat().appendMessage` or the headless equivalent).
- Quota — keep `refreshQuota` polling `/api/quota`; keep the banner and usage bar.
- Model selector — keep the badge/panel; on change, update the value passed into the CopilotKit run context (Step 2).
- History/sessions — keep `openHistory`/`resumeSession`; seed CopilotKit's message list on resume.

- [ ] **Step 6: Manual verification (drive the app)**

Run `npm run dev` and confirm each, recording results:
1. Ask "who is gutemberg?" → streamed answer + auto-scroll to `about`.
2. `/work` command → scrolls to timeline, quip appears.
3. Switch model to an OpenRouter free model → still answers (note tool-call quirks).
4. Trigger quota exhaustion (set `CHAT_TOKENS_LIMIT_24H=1`) → canned quota message + banner.
5. Off-topic messages up to the interval → warn, then block.
6. Manual nav click → quip via `/api/quip`.
7. Open history → prior sessions listed; resume loads messages.

- [ ] **Step 7: Update `components/chat.test.tsx`**

Adapt the existing render test to the new component (mock `@copilotkit/react-core`/`react-ui`). At minimum assert the terminal shell + quick commands render.

- [ ] **Step 8: Commit**

```bash
git add components/chat.tsx components/chat.test.tsx app/page.tsx app/globals.css package.json package-lock.json
git commit -m "feat: rewrite chat frontend on copilotkit"
```

---

## Phase 4 — Quip + Tracing

### Task 11: Move quip generation to LangChain

**Files:**
- Create: `lib/quip/quip.ts`
- Create: `lib/quip/quip.test.ts`
- Modify: `app/api/quip/route.ts`

**Interfaces:**
- Consumes: `getChatModel` (Task 1).
- Produces: `generateQuip(input: { section: string; lang: string; messages?: { role: string; content: string }[] }): Promise<string>` returning the formatted `→ section · text` string.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/quip/quip.test.ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/agent/models', () => ({
  getChatModel: () => ({ invoke: async () => ({ content: '"just a joke"' }) }),
}));
import { generateQuip } from './quip';

describe('generateQuip', () => {
  it('formats and strips quotes', async () => {
    const quip = await generateQuip({ section: 'about', lang: 'en' });
    expect(quip).toBe('→ about · just a joke');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- lib/quip/quip.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Move the prompt building and `SECTION_LABELS` from `app/api/quip/route.ts` into `lib/quip/quip.ts`; replace `generateText` with `getChatModel('openrouter', 'mistralai/mistral-7b-instruct').invoke(prompt)`, reading `.content`.

```typescript
// lib/quip/quip.ts
import { getChatModel } from '@/lib/agent/models';

const QUIP_MODEL = 'mistralai/mistral-7b-instruct';
const SECTION_LABELS: Record<string, { en: string; es: string }> = {
  home: { en: 'home / hero', es: 'inicio / hero' },
  about: { en: 'about (bio & background)', es: 'sobre él (bio y trayectoria)' },
  timeline: { en: 'work history / career timeline', es: 'historial laboral / línea de tiempo' },
  projects: { en: 'projects portfolio', es: 'portafolio de proyectos' },
  services: { en: 'services (mentorship & consulting)', es: 'servicios (mentoring y consultoría)' },
  writing: { en: 'blog / writing', es: 'blog / escritos' },
  voices: { en: 'testimonials / voices', es: 'testimoniales / voces' },
  contact: { en: 'contact info', es: 'información de contacto' },
};

export async function generateQuip(input: {
  section: string; lang: string; messages?: { role: string; content: string }[];
}): Promise<string> {
  const label = SECTION_LABELS[input.section] ?? { en: input.section, es: input.section };
  const contextBlock = input.messages?.length
    ? `\nRecent chat:\n${input.messages.map((m) => `${m.role}: ${m.content}`).join('\n')}\n`
    : '';
  const prompt = input.lang === 'es'
    ? `Eres el agente terminal sarcástico del portfolio de Gutemberg Mendoza.${contextBlock}\nEscribe UN comentario muy corto (máximo 10 palabras), gracioso e irónico mientras navega a "${label.es}". Humor terminal/hacker. Solo el comentario, sin comillas.`
    : `You're the sarcastic terminal agent in Gutemberg Mendoza's portfolio.${contextBlock}\nWrite ONE very short comment (max 10 words), funny and ironic as user navigates to "${label.en}". Terminal/hacker humor. Just the comment, no quotes.`;

  const model = getChatModel('openrouter', QUIP_MODEL);
  const res = await model.invoke(prompt);
  const text = String(res.content).trim().replace(/^["']|["']$/g, '');
  return `→ ${input.section} · ${text}`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -- lib/quip/quip.test.ts`
Expected: PASS.

- [ ] **Step 5: Simplify the quip route**

Rewrite `app/api/quip/route.ts` to parse the body and call `generateQuip`, keeping the Langfuse span (updated in Task 12). Return `Response.json({ quip })`.

- [ ] **Step 6: Commit**

```bash
git add lib/quip/quip.ts lib/quip/quip.test.ts app/api/quip/route.ts
git commit -m "feat: move quip generation to langchain"
```

---

### Task 12: Swap Langfuse to the LangChain callback handler

**Files:**
- Create: `lib/tracing/langfuse.ts`
- Modify: `lib/agent/agent.ts` (or `runtime.ts`) to pass callbacks
- Modify: `app/api/quip/route.ts` (pass callbacks to `invoke`)
- Modify: `lib/quip/quip.ts` (accept optional callbacks)
- Modify: `package.json` (add `langfuse-langchain`)

**Interfaces:**
- Produces: `getLangfuseCallbacks(): CallbackHandler[]` (empty array if keys are absent, so tracing is optional).

- [ ] **Step 1: Install**

Run:
```bash
npm install langfuse-langchain
```
Confirm the exported handler name against the installed package (`CallbackHandler`). If the package resolves to `@langfuse/langchain` instead, adjust the import.

- [ ] **Step 2: Implement the factory**

```typescript
// lib/tracing/langfuse.ts
import { CallbackHandler } from 'langfuse-langchain';

let handler: CallbackHandler | null = null;

export function getLangfuseCallbacks() {
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) return [];
  handler ??= new CallbackHandler({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASEURL,
  });
  return [handler];
}
```

- [ ] **Step 3: Pass callbacks at invocation**

Where the agent is streamed (runtime) and where quip invokes, pass `{ callbacks: getLangfuseCallbacks() }` in the invoke/stream config. Thread the session/user metadata through the handler's trace options where supported.

- [ ] **Step 4: Verify a trace appears**

Run `npm run dev`, send a chat message, and confirm a trace shows up in Langfuse (or that no error is thrown when keys are unset).

- [ ] **Step 5: Commit**

```bash
git add lib/tracing/langfuse.ts lib/agent/agent.ts lib/agent/runtime.ts app/api/quip/route.ts lib/quip/quip.ts package.json package-lock.json
git commit -m "feat: trace langchain agent via langfuse callback handler"
```

---

## Phase 5 — Cleanup

### Task 13: Remove the old chat route and AI SDK usage

**Files:**
- Delete: `app/api/chat/route.ts`
- Grep for and remove any remaining `from 'ai'`, `@ai-sdk/*`, `@ai-sdk/react` imports

- [ ] **Step 1: Confirm no references remain**

Run:
```bash
grep -rn "@ai-sdk\|from 'ai'\|convertToModelMessages\|streamText\|generateObject\|generateText\|useChat" app lib components
```
Expected: no results (or only the old chat route about to be deleted).

- [ ] **Step 2: Delete the old route**

```bash
rm app/api/chat/route.ts
```

- [ ] **Step 3: Run the suite and type-check**

Run: `npm run test && npx tsc --noEmit`
Expected: all green, no type errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove legacy ai-sdk chat route"
```

---

### Task 14: Remove OTEL/manual tracing scaffolding

**Files:**
- Delete: `instrumentation.ts`, `lib/otel.ts`
- Modify: any file importing `langfuseSpanProcessor`, `startObservation`, `propagateAttributes`, `updateActiveObservation`, `observe` from `@langfuse/tracing`

- [ ] **Step 1: Find remaining manual-tracing references**

Run:
```bash
grep -rn "@langfuse/tracing\|@langfuse/otel\|@opentelemetry\|langfuseSpanProcessor\|startObservation\|propagateAttributes\|updateActiveObservation" app lib instrumentation.ts
```

- [ ] **Step 2: Remove them**

Delete the manual span code paths (now replaced by the callback handler from Task 12), including the `observe(...)` wrapper in `lib/chat/moderation.ts` (moderation is traced via the agent's callbacks). Delete `instrumentation.ts` and `lib/otel.ts` once unreferenced.

- [ ] **Step 3: Verify**

Run: `npm run test && npx tsc --noEmit && npm run build`
Expected: build succeeds; no missing-module errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove manual otel tracing scaffolding"
```

---

### Task 15: Drop unused dependencies and final verification

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Uninstall**

Run:
```bash
npm uninstall ai @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/react @langfuse/otel @langfuse/tracing @opentelemetry/sdk-node @opentelemetry/sdk-trace-node @opentelemetry/api
```

- [ ] **Step 2: Full verification**

Run:
```bash
npm run test
npx tsc --noEmit
npm run build
```
Expected: all pass.

- [ ] **Step 3: End-to-end manual drive**

Run `npm run dev` and re-run the Task 10 Step 6 checklist in full. Confirm every feature works with the AI SDK fully removed.

- [ ] **Step 4: Docker build check**

Build the container image and confirm the app (and, if the served fallback was chosen in Task 9, the LangGraph process) starts.
```bash
docker build -t personal-web . && docker run --rm -p 3000:3000 --env-file .env.local personal-web
```
Expected: chat works end-to-end in the container.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: drop vercel ai sdk and otel dependencies"
```

---

## Self-Review Notes

**Spec coverage:** module architecture (Tasks 1-8, 11-12), guards as middleware incl. `modelCallLimitMiddleware` (Tasks 5-8), built-in-middleware finding preserved (quota stays custom — Task 5), CopilotKit prebuilt + in-process runtime + served fallback (Tasks 9-10), navigate as frontend action (Task 10), Supabase source of truth / stateless agent (Tasks 5-7), multi-provider (Task 1), Langfuse via callback handler (Task 12), dependency add/remove ordering (Tasks 1/9/10 add, 13-15 remove), Dockerizable single container (Task 15). All spec sections map to a task.

**Known confirm-in-implementation points (flagged in the spec risks, not placeholders):** the exact middleware `stateSchema` requirement for the shared `gmctlQuota` key (Task 5/8), the CopilotKit in-process adapter import/shape (Task 9 spike + fallback), and the Langfuse package export name (Task 12). Each has a concrete verification step and a defined fallback.

**Deliberate behavior change:** moderation `moderator_check` usage events are dropped because `withStructuredOutput` does not surface token usage (Task 4). This is the one intentional deviation from current behavior; called out in the commit.
