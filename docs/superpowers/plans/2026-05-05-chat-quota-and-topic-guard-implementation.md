# Chat Quota And Topic Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add anonymous token-based quota enforcement, streaming quota UI, soft topic moderation, and exhausted-quota fallback behavior to the website chat.

**Architecture:** The backend resolves an anonymous `visitor_id` from client and server signals, logs usage events in Supabase, and enforces a rolling 24-hour token cap in `POST /api/chat`. The frontend fetches quota state, shows live usage counters, and switches to local sarcastic replies plus a contact CTA when quota is exhausted. Topic moderation runs every 8 user messages through a separate OpenRouter model with warn-first, block-on-repeat behavior.

**Tech Stack:** Next.js 16 App Router, React 19, AI SDK 6, Supabase, TypeScript, Vitest

---

## File Map

### New files

- `vitest.config.ts` - Vitest config with path alias support and `jsdom` environment for UI tests
- `tests/setup.ts` - shared test setup and basic browser polyfills/mocks
- `lib/chat/visitor.ts` - anonymous visitor identity helpers and cookie constants
- `lib/chat/quota.ts` - rolling 24-hour quota aggregation, exhausted checks, and usage event helpers
- `lib/chat/moderation.ts` - topic moderation prompt, verdict parsing, and fallback logic
- `lib/chat/exhausted-replies.ts` - localized prerecorded exhausted-quota reply pools
- `app/api/quota/route.ts` - quota hydration endpoint
- `supabase/migrations/20260505000002_add_chat_quota_tables.sql` - new Supabase schema for visitor identity, usage, and moderation tables
- `lib/chat/visitor.test.ts`
- `lib/chat/quota.test.ts`
- `lib/chat/moderation.test.ts`
- `components/chat.test.tsx`

### Modified files

- `package.json` - add test dependencies and scripts
- `app/api/chat/route.ts` - integrate visitor resolution, quota checks, moderation, and streamed metadata
- `app/api/history/route.ts` - optionally persist resolved `visitor_id` alongside stored history rows
- `components/chat.tsx` - fetch quota state, render counters/banner, and switch to local exhausted mode
- `lib/i18n.ts` - add all new copy for quota, moderation, and exhausted mode
- `lib/supabase.ts` - export typed admin helpers if needed by new chat modules

### Existing files to reference while implementing

- `docs/superpowers/specs/2026-05-05-chat-quota-and-topic-guard-design.md`
- `app/api/quip/route.ts`
- `lib/models.ts`

---

### Task 1: Add a test harness before changing chat behavior

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Modify: `package.json`
- Test: `vitest.config.ts`, `tests/setup.ts`

- [ ] **Step 1: Add the failing test script and Vitest config**

Add the test script and dev dependencies in `package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "jsdom": "^26.1.0",
    "vitest": "^2.1.9"
  }
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['lib/**/*.test.ts', 'components/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

Create `tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 2: Run test to verify the harness is not ready yet**

Run: `npm test`

Expected: `FAIL` because there are no test files matching the configured globs yet.

- [ ] **Step 3: Add one minimal smoke test so the harness has a green baseline**

Create `lib/chat/quota.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('test harness', () => {
  it('runs vitest in this repo', () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 4: Run test to verify the harness passes**

Run: `npm test`

Expected: `PASS` with `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/setup.ts lib/chat/quota.test.ts
git commit -m "test: add vitest harness for chat work"
```

### Task 2: Add Supabase schema for visitor identity, usage ledger, and moderation events

**Files:**
- Create: `supabase/migrations/20260505000002_add_chat_quota_tables.sql`
- Test: `supabase/migrations/20260505000002_add_chat_quota_tables.sql`

- [ ] **Step 1: Write a failing schema expectation test as SQL review criteria**

Use this checklist while writing the migration:

```sql
-- expected objects
-- visitor_identities
-- chat_usage_events
-- topic_moderation_events
-- indexes on visitor and created_at fields
-- optional visitor_id on chat_messages
```

This step is intentionally a review checklist because the repo does not currently have a DB test harness.

- [ ] **Step 2: Create the migration with the exact schema**

Create `supabase/migrations/20260505000002_add_chat_quota_tables.sql`:

```sql
CREATE TABLE visitor_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_id text,
  server_cookie_id text,
  current_ip_hash text,
  risk_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_visitor_identities_server_cookie_id
  ON visitor_identities(server_cookie_id)
  WHERE server_cookie_id IS NOT NULL;

CREATE INDEX idx_visitor_identities_anon_id
  ON visitor_identities(anon_id)
  WHERE anon_id IS NOT NULL;

ALTER TABLE chat_messages
  ADD COLUMN visitor_id uuid REFERENCES visitor_identities(id);

CREATE INDEX idx_chat_messages_visitor_id_created_at
  ON chat_messages(visitor_id, created_at DESC);

CREATE TABLE chat_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id uuid NOT NULL REFERENCES visitor_identities(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  message_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('user_input', 'assistant_output', 'moderator_check', 'blocked_response')),
  provider text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  total_tokens integer NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  estimated_cost_usd numeric(12, 6),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_usage_events_visitor_id_created_at
  ON chat_usage_events(visitor_id, created_at DESC);

CREATE INDEX idx_chat_usage_events_session_id_created_at
  ON chat_usage_events(session_id, created_at DESC);

CREATE TABLE topic_moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id uuid NOT NULL REFERENCES visitor_identities(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  checked_after_user_message_count integer NOT NULL CHECK (checked_after_user_message_count > 0),
  verdict text NOT NULL CHECK (verdict IN ('allow', 'warn', 'block', 'error')),
  reason_code text NOT NULL,
  raw_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_topic_moderation_events_visitor_id_created_at
  ON topic_moderation_events(visitor_id, created_at DESC);

ALTER TABLE visitor_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_moderation_events ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 3: Review the migration against the checklist**

Run: `sed -n '1,240p' supabase/migrations/20260505000002_add_chat_quota_tables.sql`

Expected: all three new tables, indexes, and `visitor_id` support are present exactly once.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260505000002_add_chat_quota_tables.sql
git commit -m "feat: add chat quota and moderation tables"
```

### Task 3: Build visitor identity and quota helpers with unit coverage

**Files:**
- Create: `lib/chat/visitor.ts`
- Create: `lib/chat/quota.ts`
- Create: `lib/chat/visitor.test.ts`
- Modify: `lib/chat/quota.test.ts`
- Test: `lib/chat/visitor.test.ts`
- Test: `lib/chat/quota.test.ts`

- [ ] **Step 1: Write failing tests for visitor resolution and rolling quota math**

Create `lib/chat/visitor.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildVisitorLookup } from './visitor';

describe('buildVisitorLookup', () => {
  it('prefers a server cookie id when available', () => {
    const lookup = buildVisitorLookup({
      anonId: 'anon-1',
      cookieId: 'cookie-1',
      ipHash: 'ip-1',
    });

    expect(lookup.primary.kind).toBe('server_cookie_id');
    expect(lookup.primary.value).toBe('cookie-1');
  });

  it('falls back to anon id when there is no cookie', () => {
    const lookup = buildVisitorLookup({
      anonId: 'anon-1',
      cookieId: null,
      ipHash: 'ip-1',
    });

    expect(lookup.primary.kind).toBe('anon_id');
  });
});
```

Replace the smoke test in `lib/chat/quota.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { computeQuotaSnapshot, isQuotaExhausted } from './quota';

describe('computeQuotaSnapshot', () => {
  it('counts only events inside the last 24 hours', () => {
    const now = new Date('2026-05-05T12:00:00.000Z');
    const snapshot = computeQuotaSnapshot({
      now,
      limit: 1000,
      events: [
        { total_tokens: 300, created_at: '2026-05-05T11:30:00.000Z' },
        { total_tokens: 200, created_at: '2026-05-04T13:00:00.000Z' },
        { total_tokens: 900, created_at: '2026-05-04T11:00:00.000Z' },
      ],
    });

    expect(snapshot.tokensUsed24h).toBe(500);
    expect(snapshot.tokensRemaining24h).toBe(500);
  });

  it('marks the visitor exhausted once the limit is reached', () => {
    expect(isQuotaExhausted({ tokensUsed24h: 1000, limit: 1000 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/chat/visitor.test.ts lib/chat/quota.test.ts`

Expected: `FAIL` with missing exports for `buildVisitorLookup`, `computeQuotaSnapshot`, or `isQuotaExhausted`.

- [ ] **Step 3: Implement the visitor helper**

Create `lib/chat/visitor.ts`:

```ts
export const VISITOR_COOKIE_NAME = 'gmctl_vid';

export interface BuildVisitorLookupInput {
  anonId: string | null;
  cookieId: string | null;
  ipHash: string | null;
}

export interface VisitorLookupKey {
  kind: 'server_cookie_id' | 'anon_id';
  value: string;
}

export interface VisitorLookup {
  primary: VisitorLookupKey;
  secondary: VisitorLookupKey[];
  ipHash: string | null;
}

export function buildVisitorLookup(input: BuildVisitorLookupInput): VisitorLookup {
  if (input.cookieId) {
    return {
      primary: { kind: 'server_cookie_id', value: input.cookieId },
      secondary: input.anonId ? [{ kind: 'anon_id', value: input.anonId }] : [],
      ipHash: input.ipHash,
    };
  }

  if (!input.anonId) {
    throw new Error('anonId or cookieId is required');
  }

  return {
    primary: { kind: 'anon_id', value: input.anonId },
    secondary: [],
    ipHash: input.ipHash,
  };
}
```

- [ ] **Step 4: Implement the quota math helper**

Create `lib/chat/quota.ts`:

```ts
const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface UsageEventLike {
  total_tokens: number;
  created_at: string;
}

export interface ComputeQuotaSnapshotInput {
  now: Date;
  limit: number;
  events: UsageEventLike[];
}

export interface QuotaSnapshot {
  tokensUsed24h: number;
  tokensRemaining24h: number;
  quotaExhausted: boolean;
}

export function computeQuotaSnapshot(input: ComputeQuotaSnapshotInput): QuotaSnapshot {
  const windowStart = input.now.getTime() - WINDOW_MS;
  const tokensUsed24h = input.events
    .filter((event) => new Date(event.created_at).getTime() >= windowStart)
    .reduce((sum, event) => sum + event.total_tokens, 0);

  const tokensRemaining24h = Math.max(input.limit - tokensUsed24h, 0);

  return {
    tokensUsed24h,
    tokensRemaining24h,
    quotaExhausted: tokensUsed24h >= input.limit,
  };
}

export function isQuotaExhausted(input: { tokensUsed24h: number; limit: number }) {
  return input.tokensUsed24h >= input.limit;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- lib/chat/visitor.test.ts lib/chat/quota.test.ts`

Expected: `PASS` with `4 passed`.

- [ ] **Step 6: Commit**

```bash
git add lib/chat/visitor.ts lib/chat/quota.ts lib/chat/visitor.test.ts lib/chat/quota.test.ts
git commit -m "feat: add anonymous visitor and quota helpers"
```

### Task 4: Add moderation logic with explicit warn/block fallback behavior

**Files:**
- Create: `lib/chat/moderation.ts`
- Create: `lib/chat/moderation.test.ts`
- Modify: `package.json`
- Test: `lib/chat/moderation.test.ts`

- [ ] **Step 1: Write failing moderation tests**

Create `lib/chat/moderation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getModerationAction, shouldRunTopicModeration } from './moderation';

describe('shouldRunTopicModeration', () => {
  it('runs every 8 user messages', () => {
    expect(shouldRunTopicModeration(8, 8)).toBe(true);
    expect(shouldRunTopicModeration(7, 8)).toBe(false);
  });
});

describe('getModerationAction', () => {
  it('warns on first off-topic verdict', () => {
    expect(getModerationAction({ verdict: 'off_topic', alreadyWarned: false })).toEqual({
      verdict: 'warn',
      shouldCallMainModel: false,
    });
  });

  it('blocks on repeated off-topic verdict', () => {
    expect(getModerationAction({ verdict: 'off_topic', alreadyWarned: true })).toEqual({
      verdict: 'block',
      shouldCallMainModel: false,
    });
  });

  it('allows through on moderation errors', () => {
    expect(getModerationAction({ verdict: 'error', alreadyWarned: true })).toEqual({
      verdict: 'error',
      shouldCallMainModel: true,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/chat/moderation.test.ts`

Expected: `FAIL` with missing exports for `getModerationAction` or `shouldRunTopicModeration`.

- [ ] **Step 3: Implement moderation helpers**

Create `lib/chat/moderation.ts`:

```ts
export type TopicVerdict = 'on_topic' | 'off_topic' | 'error';
export type ModerationActionVerdict = 'allow' | 'warn' | 'block' | 'error';

export function shouldRunTopicModeration(userMessageCount: number, interval: number) {
  return userMessageCount > 0 && userMessageCount % interval === 0;
}

export function getModerationAction(input: {
  verdict: TopicVerdict;
  alreadyWarned: boolean;
}): { verdict: ModerationActionVerdict; shouldCallMainModel: boolean } {
  if (input.verdict === 'on_topic') {
    return { verdict: 'allow', shouldCallMainModel: true };
  }

  if (input.verdict === 'error') {
    return { verdict: 'error', shouldCallMainModel: true };
  }

  if (input.alreadyWarned) {
    return { verdict: 'block', shouldCallMainModel: false };
  }

  return { verdict: 'warn', shouldCallMainModel: false };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/chat/moderation.test.ts`

Expected: `PASS` with `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/chat/moderation.ts lib/chat/moderation.test.ts
git commit -m "feat: add topic moderation decision helpers"
```

### Task 5: Wire backend quota, moderation, and quota endpoint

**Files:**
- Modify: `app/api/chat/route.ts`
- Create: `app/api/quota/route.ts`
- Modify: `app/api/history/route.ts`
- Modify: `lib/supabase.ts`
- Modify: `lib/chat/visitor.ts`
- Modify: `lib/chat/quota.ts`
- Modify: `lib/chat/moderation.ts`
- Test: `npm run build`

- [ ] **Step 1: Extend helpers for real route use**

Update `lib/chat/visitor.ts` with cookie parsing helpers and stable ids:

```ts
import { createHash, randomUUID } from 'node:crypto';
import { cookies, headers } from 'next/headers';

export async function getRequestIpHash() {
  const headerStore = await headers();
  const ip = headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  if (!ip) return null;
  return createHash('sha256').update(ip).digest('hex');
}

export async function getOrCreateVisitorCookieId() {
  const cookieStore = await cookies();
  const existing = cookieStore.get(VISITOR_COOKIE_NAME)?.value ?? null;
  if (existing) return { value: existing, isNew: false };
  const value = randomUUID();
  cookieStore.set(VISITOR_COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  });
  return { value, isNew: true };
}
```

Update `lib/chat/quota.ts` with Supabase-facing types and helpers:

```ts
export interface PersistUsageEventInput {
  visitorId: string;
  sessionId: string;
  messageId: string;
  direction: 'user_input' | 'assistant_output' | 'moderator_check' | 'blocked_response';
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd?: number | null;
}

export function toUsageInsert(input: PersistUsageEventInput) {
  return {
    visitor_id: input.visitorId,
    session_id: input.sessionId,
    message_id: input.messageId,
    direction: input.direction,
    provider: input.provider,
    model: input.model,
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
    total_tokens: input.inputTokens + input.outputTokens,
    estimated_cost_usd: input.estimatedCostUsd ?? null,
  };
}
```

- [ ] **Step 2: Integrate quota checks into `POST /api/chat`**

Refactor `app/api/chat/route.ts` so the top of the handler looks like this:

```ts
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';

const CHAT_TOKENS_LIMIT_24H = Number(process.env.CHAT_TOKENS_LIMIT_24H ?? '12000');
const CHAT_MODERATION_EVERY_N_USER_MESSAGES = Number(process.env.CHAT_MODERATION_EVERY_N_USER_MESSAGES ?? '8');

export async function POST(req: Request) {
  const { messages, provider, model, session_id, anon_id } = await req.json() as {
    messages: UIMessage[];
    provider?: Provider;
    model?: string;
    session_id?: string;
    anon_id?: string;
  };

  const cookie = await getOrCreateVisitorCookieId();
  const ipHash = await getRequestIpHash();
  const lookup = buildVisitorLookup({
    anonId: anon_id ?? null,
    cookieId: cookie.value,
    ipHash,
  });

  const { data: existingVisitor } = await supabase
    .from('visitor_identities')
    .select('id, anon_id, server_cookie_id')
    .or(`server_cookie_id.eq.${lookup.primary.value}${anon_id ? `,anon_id.eq.${anon_id}` : ''}`)
    .maybeSingle();

  const visitor = existingVisitor ?? (await supabase
    .from('visitor_identities')
    .insert({
      anon_id: anon_id ?? null,
      server_cookie_id: cookie.value,
      current_ip_hash: ipHash,
    })
    .select('id, anon_id, server_cookie_id')
    .single()).data;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: usageRows } = await supabase
    .from('chat_usage_events')
    .select('total_tokens, created_at')
    .eq('visitor_id', visitor.id)
    .gte('created_at', since);

  const snapshot = computeQuotaSnapshot({
    now: new Date(),
    limit: CHAT_TOKENS_LIMIT_24H,
    events: usageRows ?? [],
  });

  if (snapshot.quotaExhausted) {
    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: ({ writer }) => {
          writer.write({
            type: 'text',
            value: 'quota exhausted',
          });
        },
      }),
      headers: {
        'x-chat-quota-exhausted': 'true',
        'x-chat-tokens-used-24h': String(snapshot.tokensUsed24h),
        'x-chat-tokens-remaining-24h': String(snapshot.tokensRemaining24h),
      },
    });
  }
}
```

- [ ] **Step 3: Add moderation short-circuit handling**

Inside `app/api/chat/route.ts`, before `streamText`, count user messages and branch:

```ts
const userMessageCount = messages.filter((message) => message.role === 'user').length;
const { data: priorWarnings } = await supabase
  .from('topic_moderation_events')
  .select('id')
  .eq('visitor_id', visitor.id)
  .eq('verdict', 'warn')
  .limit(1);

if (shouldRunTopicModeration(userMessageCount, CHAT_MODERATION_EVERY_N_USER_MESSAGES)) {
  const moderationVerdict = await classifyTopicConversation({
    messages,
    model: process.env.CHAT_MODERATION_MODEL ?? 'meta-llama/llama-3.3-70b-instruct:free',
    timeoutMs: Number(process.env.CHAT_MODERATION_TIMEOUT_MS ?? '4000'),
  });

  const moderationAction = getModerationAction({
    verdict: moderationVerdict.verdict,
    alreadyWarned: (priorWarnings?.length ?? 0) > 0,
  });

  if (!moderationAction.shouldCallMainModel) {
    const policyText = moderationAction.verdict === 'warn'
      ? getTopicPolicyCopy('warn', messages)
      : getTopicPolicyCopy('block', messages);

    await supabase.from('topic_moderation_events').insert({
      visitor_id: visitor.id,
      session_id: session_id ?? 'unknown',
      checked_after_user_message_count: userMessageCount,
      verdict: moderationAction.verdict,
      reason_code: moderationVerdict.reasonCode,
      raw_label: moderationVerdict.rawLabel,
    });

    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: ({ writer }) => {
          writer.write({
            type: 'text',
            value: policyText,
          });
        },
      }),
      headers: {
        'x-chat-policy-verdict': moderationAction.verdict,
      },
    });
  }
}
```

Implement `classifyTopicConversation` in `lib/chat/moderation.ts` with:

- `generateText` through OpenRouter
- a strict response schema of `on_topic` or `off_topic`
- a timeout wrapper
- fallback to `{ verdict: 'error', reasonCode: 'timeout_or_provider_error' }`

- [ ] **Step 4: Emit quota metadata and persist final usage after streaming**

After creating `result = streamText(...)`, use provider usage metadata if available and persist it:

```ts
const response = result.toUIMessageStreamResponse({
  messageMetadata: ({ part }) => {
    if (part.type === 'finish') {
      return {
        quota: {
          tokensUsed24h: snapshot.tokensUsed24h,
          tokensLimit24h: CHAT_TOKENS_LIMIT_24H,
          tokensRemaining24h: snapshot.tokensRemaining24h,
          quotaExhausted: snapshot.quotaExhausted,
        },
        usage: part.totalUsage ?? null,
      };
    }

    return undefined;
  },
});
```

Also persist:

- one `chat_usage_events` row for the main request by passing `part.totalUsage.inputTokens` and `part.totalUsage.outputTokens` into `toUsageInsert(...)`
- one `topic_moderation_events` row when moderation runs
- `visitor_id` on `chat_messages` inserts inside `app/api/history/route.ts` by resolving the same visitor from `anon_id`

- [ ] **Step 5: Add `GET /api/quota`**

Create `app/api/quota/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const anonId = req.nextUrl.searchParams.get('anon_id');
  const cookie = await getOrCreateVisitorCookieId();
  const ipHash = await getRequestIpHash();
  const lookup = buildVisitorLookup({
    anonId,
    cookieId: cookie.value,
    ipHash,
  });

  const { data: visitor } = await supabase
    .from('visitor_identities')
    .select('id')
    .or(`server_cookie_id.eq.${lookup.primary.value}${anonId ? `,anon_id.eq.${anonId}` : ''}`)
    .maybeSingle();

  if (!visitor) {
    return NextResponse.json({
      tokens_used_24h: 0,
      tokens_limit_24h: CHAT_TOKENS_LIMIT_24H,
      tokens_remaining_24h: CHAT_TOKENS_LIMIT_24H,
      quota_exhausted: false,
      window_rolling: true,
    });
  }

  const { data: usageRows } = await supabase
    .from('chat_usage_events')
    .select('total_tokens, created_at')
    .eq('visitor_id', visitor.id)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const snapshot = computeQuotaSnapshot({
    now: new Date(),
    limit: CHAT_TOKENS_LIMIT_24H,
    events: usageRows ?? [],
  });

  return NextResponse.json({
    tokens_used_24h: snapshot.tokensUsed24h,
    tokens_limit_24h: CHAT_TOKENS_LIMIT_24H,
    tokens_remaining_24h: snapshot.tokensRemaining24h,
    quota_exhausted: snapshot.quotaExhausted,
    window_rolling: true,
  });
}
```

- [ ] **Step 6: Run build to verify route code compiles**

Run: `npm run build`

Expected: `Compiled successfully` and no TypeScript errors from the new route branches.

- [ ] **Step 7: Commit**

```bash
git add app/api/chat/route.ts app/api/quota/route.ts app/api/history/route.ts lib/supabase.ts lib/chat/visitor.ts lib/chat/quota.ts lib/chat/moderation.ts
git commit -m "feat: enforce chat quota and moderation in api routes"
```

### Task 6: Add i18n copy and exhausted-mode reply helpers

**Files:**
- Modify: `lib/i18n.ts`
- Create: `lib/chat/exhausted-replies.ts`
- Test: `lib/chat/moderation.test.ts`

- [ ] **Step 1: Extend i18n with quota and moderation copy**

Normalize the `chat` section in `lib/i18n.ts` so English and Spanish keys stay parallel:

```ts
chat: {
  quota: {
    title: 'quota exhausted',
    body: 'you reached the 24-hour chat limit.',
    contact: 'contact',
    used: 'used',
    remaining: 'remaining',
  },
  moderation: {
    warn: 'I can help with Gutemberg, his work, projects, services, writing, or contact.',
    block: 'That is outside this chat’s scope. Try asking about Gutemberg instead.',
  },
}
```

Mirror the same nested structure in the Spanish branch:

```ts
chat: {
  quota: {
    title: 'cuota agotada',
    body: 'alcanzaste el límite de chat de las últimas 24 horas.',
    contact: 'contacto',
    used: 'usados',
    remaining: 'restantes',
  },
  moderation: {
    warn: 'Puedo ayudarte con Gutemberg, su trabajo, proyectos, servicios, escritos o contacto.',
    block: 'Eso se sale del alcance de este chat. Prueba preguntando sobre Gutemberg.',
  },
}
```

- [ ] **Step 2: Add localized prerecorded exhausted replies**

Create `lib/chat/exhausted-replies.ts`:

```ts
import type { Lang } from '@/lib/data';

const EXHAUSTED_REPLIES: Record<Lang, string[]> = {
  en: [
    'nice try. the quota is already dead.',
    'this is now theater. prerecorded replies only.',
    'no budget, no inference. try contact.',
    'the model has been temporarily laid off for overspending.',
  ],
  es: [
    'bonita tentativa. la cuota ya murió hace rato.',
    'esto ahora es teatro. mensajes pregrabados únicamente.',
    'sin presupuesto no hay inferencia. prueba contacto.',
    'el modelo fue despedido temporalmente por exceso de consumo.',
  ],
};

export function getExhaustedReply(lang: Lang, seed: number) {
  const pool = EXHAUSTED_REPLIES[lang];
  return pool[seed % pool.length];
}
```

- [ ] **Step 3: Add a unit test for exhausted reply selection**

Append to `lib/chat/moderation.test.ts`:

```ts
import { getExhaustedReply } from './exhausted-replies';

it('selects a stable exhausted reply from the localized pool', () => {
  expect(getExhaustedReply('es', 1)).toBe('esto ahora es teatro. mensajes pregrabados únicamente.');
  expect(getExhaustedReply('en', 2)).toBe('no budget, no inference. try contact.');
});
```

- [ ] **Step 4: Run tests to verify the new copy helper passes**

Run: `npm test -- lib/chat/moderation.test.ts`

Expected: `PASS` with the exhausted reply assertions included.

- [ ] **Step 5: Commit**

```bash
git add lib/i18n.ts lib/chat/exhausted-replies.ts lib/chat/moderation.test.ts
git commit -m "feat: add quota and moderation copy"
```

### Task 7: Update chat UI for quota hydration, streaming counters, banner, and exhausted mode

**Files:**
- Modify: `components/chat.tsx`
- Create: `components/chat.test.tsx`
- Test: `components/chat.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Create `components/chat.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { Chat } from './chat';

describe('Chat quota states', () => {
  it('renders the exhausted banner when quota is exhausted', () => {
    render(
      <Chat
        lang="en"
        setLang={() => {}}
        scrollTo={() => {}}
        theme="dark"
        setTheme={() => {}}
        setTlFilter={() => {}}
        setBlogFilter={() => {}}
        selectedModel={{ id: 'meta-llama/llama-3.3-70b-instruct', label: 'llama', provider: 'openrouter', ctx: '128k', free: false }}
        onModelChange={() => {}}
      />
    );

    expect(screen.queryByText(/quota exhausted/i)).not.toBeInTheDocument();
  });
});
```

This first assertion is intentionally weak; it establishes the render harness before the component gains quota props/state.

- [ ] **Step 2: Run tests to verify the component test compiles**

Run: `npm test -- components/chat.test.tsx`

Expected: `PASS` with one trivial render assertion.

- [ ] **Step 3: Add quota state, hydration, and exhausted-mode rendering**

Update `components/chat.tsx` with these state additions near the top of the component:

```ts
const [quota, setQuota] = useState({
  tokensUsed24h: 0,
  tokensLimit24h: 0,
  tokensRemaining24h: 0,
  quotaExhausted: false,
});
const [streamUsage, setStreamUsage] = useState({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
```

Add quota hydration in the existing mount effect:

```ts
fetch(`/api/quota?anon_id=${id}`)
  .then((r) => r.json())
  .then((data) => {
    setQuota({
      tokensUsed24h: data.tokens_used_24h ?? 0,
      tokensLimit24h: data.tokens_limit_24h ?? 0,
      tokensRemaining24h: data.tokens_remaining_24h ?? 0,
      quotaExhausted: data.quota_exhausted ?? false,
    });
  })
  .catch(() => {});
```

Short-circuit `onSubmit` when quota is exhausted:

```ts
if (quota.quotaExhausted) {
  pushUser(val);
  pushBot(getExhaustedReply(lang, messages.length));
  scrollTo('contact');
  return;
}
```

Refresh quota after assistant responses complete:

```ts
useEffect(() => {
  if (!anonId || prevStatus.current !== 'streaming' || status !== 'ready') return;

  fetch(`/api/quota?anon_id=${anonId}`)
    .then((r) => r.json())
    .then((data) => {
      setQuota({
        tokensUsed24h: data.tokens_used_24h ?? 0,
        tokensLimit24h: data.tokens_limit_24h ?? 0,
        tokensRemaining24h: data.tokens_remaining_24h ?? 0,
        quotaExhausted: data.quota_exhausted ?? false,
      });
    })
    .catch(() => {});
}, [anonId, status]);
```

Render the banner above the input:

```tsx
{quota.quotaExhausted && (
  <div className="chat-quota-banner">
    <strong>{i18n.chat.quota.title}</strong>
    <span>{i18n.chat.quota.body}</span>
    <button onClick={() => scrollTo('contact')}>{i18n.chat.quota.contact}</button>
  </div>
)}
```

Render the counters in the header or footer:

```tsx
<div className="chat-usage">
  <span>{i18n.chat.quota.used}: {quota.tokensUsed24h}</span>
  <span>{i18n.chat.quota.remaining}: {quota.tokensRemaining24h}</span>
</div>
```

- [ ] **Step 4: Strengthen the UI test to cover exhausted rendering**

Replace the assertion in `components/chat.test.tsx` with:

```tsx
expect(screen.getByText(/quota exhausted/i)).toBeInTheDocument();
expect(screen.getByRole('button', { name: /contact/i })).toBeInTheDocument();
```

Stub the quota fetch in the test:

```ts
vi.stubGlobal('fetch', vi.fn(async () => ({
  ok: true,
  headers: new Headers({ 'Content-Type': 'application/json' }),
  json: async () => ({
    tokens_used_24h: 12000,
    tokens_limit_24h: 12000,
    tokens_remaining_24h: 0,
    quota_exhausted: true,
  }),
})) as typeof fetch);
```

- [ ] **Step 5: Run tests to verify the UI state works**

Run: `npm test -- components/chat.test.tsx`

Expected: `PASS` with exhausted banner assertions.

- [ ] **Step 6: Run the full test suite and production build**

Run: `npm test`
Expected: `PASS` for all unit and UI tests.

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 7: Commit**

```bash
git add components/chat.tsx components/chat.test.tsx
git commit -m "feat: add chat quota ui and exhausted mode"
```

### Task 8: Final verification and operator configuration

**Files:**
- Modify: `.env.local.example`
- Test: `.env.local.example`

- [ ] **Step 1: Add environment documentation**

Update `.env.local.example` with:

```dotenv
CHAT_TOKENS_LIMIT_24H=12000
CHAT_MODERATION_EVERY_N_USER_MESSAGES=8
CHAT_MODERATION_PROVIDER=openrouter
CHAT_MODERATION_MODEL=meta-llama/llama-3.3-70b-instruct:free
CHAT_MODERATION_TIMEOUT_MS=4000
VISITOR_COOKIE_SIGNING_SECRET=replace-me
```

- [ ] **Step 2: Run a final repo-level verification**

Run: `npm test`
Expected: `PASS`.

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add .env.local.example
git commit -m "chore: document chat quota configuration"
```

## Self-Review

### Spec coverage

- rolling 24-hour token quota: Task 2, Task 3, Task 5, Task 7
- backend quota enforcement: Task 5
- streaming quota UI: Task 5, Task 7
- exhausted banner and contact CTA: Task 6, Task 7
- prerecorded sarcastic replies: Task 6, Task 7
- i18n coverage: Task 6
- soft moderation every 8 user messages: Task 4, Task 5
- moderation fallback to allow on failure: Task 4, Task 5
- environment configuration: Task 8

### Placeholder scan

Manual scan completed:

- no `TBD`
- no `TODO`
- no "similar to Task N"
- each code step includes concrete file content or exact branch structure

### Type consistency

Checked names used across tasks:

- `buildVisitorLookup`
- `computeQuotaSnapshot`
- `isQuotaExhausted`
- `shouldRunTopicModeration`
- `getModerationAction`
- `getExhaustedReply`

The plan uses the same names consistently across helper, route, and test tasks.
