# Mobile-First Chat + Generative UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On mobile, make the chat the primary full-screen experience and let the agent render Projects/Services/Contact as compact cards inline in the chat; desktop keeps the current split layout + scroll-to-section.

**Architecture:** The agent keeps calling the existing `navigate(section)` tool. The chat frontend, which owns its own terminal render, observes those tool calls: on a mobile viewport it appends a display-only card message (rendered by a per-section card component reading `lib/data`); on desktop it scrolls to the section as today. A `useMediaQuery` hook gates card rendering to mobile. The mobile chat opens by default so it is the landing view.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, CopilotKit headless (`useAgent`), Vitest + Testing Library, existing terminal CSS tokens.

## Global Constraints

- Terminal aesthetic + theme-aware: use `var(--mono)`, `var(--fg)`, `var(--fg-2)`, `var(--fg-3)`, `var(--accent)`, `var(--line)`, `var(--bg-2)`, `var(--bg-3)` — never hard-coded colors.
- Reuse `lib/data.ts` (`PROJECTS`, `SERVICES`, `CONTACTS`); no duplicated content.
- Cards render **only on mobile viewports** (`max-width: 1024px`); desktop keeps `navigate → scrollTo`, never cards.
- Card messages are display-only: never added to `agent.messages` (kept out of model context).
- Pilot sections only: `projects`, `services`, `contact`.
- Bilingual copy via the `lang` prop (`'en' | 'es'`), matching existing `descEn/descEs`, `titleEn/titleEs`, `perEn/perEs` fields.
- Responsive: `100dvh` (not `100vh`), `env(safe-area-inset-*)`, touch targets ≥44px, input `font-size ≥16px`, no horizontal page scroll.
- Run tests with `npm run test`; dev server `npm run dev` (loads `.env.local` + `.env`).

---

## File Structure

```
lib/hooks/use-media-query.ts               NEW  SSR-safe useMediaQuery(query): boolean
components/chat-cards/projects-card.tsx     NEW  ProjectsCard({ lang })
components/chat-cards/services-card.tsx     NEW  ServicesCard({ lang })
components/chat-cards/contact-card.tsx      NEW  ContactCard({ lang })
components/chat-cards/index.ts              NEW  CARD_SECTIONS + CARD_COMPONENTS registry
components/chat.tsx                          MOD  cardMsgs state, mobile card injection, render cards
app/page.tsx                                MOD  open mobile chat by default (landing)
app/globals.css                             MOD  card styles + mobile full-screen (100dvh/safe-area)
```

Card data shapes (from `lib/data.ts`, for reference):
- `PROJECTS: { tag, title, descEn, descEs, stack: string[], ascii }[]`
- `SERVICES: { num, titleEn, titleEs, descEn, descEs, bulletsEn, bulletsEs, price, perEn, perEs }[]`
- `CONTACTS: readonly [key, label, href][]`

---

## Task 1: SSR-safe useMediaQuery hook

**Files:**
- Create: `lib/hooks/use-media-query.ts`
- Test: `lib/hooks/use-media-query.test.ts`

**Interfaces:**
- Produces: `useMediaQuery(query: string): boolean` — `false` during SSR/first paint, resolves to the real match after mount, updates on change.

- [ ] **Step 1: Write the failing test**

```tsx
// lib/hooks/use-media-query.test.ts
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useMediaQuery } from './use-media-query';

function stubMatchMedia(initial: boolean) {
  let listener: ((e: { matches: boolean }) => void) | null = null;
  const mql = {
    matches: initial,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => { listener = cb; },
    removeEventListener: () => { listener = null; },
  };
  vi.stubGlobal('matchMedia', vi.fn(() => mql));
  return {
    fire: (matches: boolean) => { mql.matches = matches; listener?.({ matches }); },
  };
}

describe('useMediaQuery', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('reflects the initial match after mount', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(max-width: 1024px)'));
    expect(result.current).toBe(true);
  });

  it('updates when the media query changes', () => {
    const { fire } = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(max-width: 1024px)'));
    expect(result.current).toBe(false);
    act(() => fire(true));
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- lib/hooks/use-media-query.test.ts`
Expected: FAIL — `Cannot find module './use-media-query'`.

- [ ] **Step 3: Implement the hook**

```tsx
// lib/hooks/use-media-query.ts
'use client';

import { useEffect, useState } from 'react';

/**
 * SSR-safe media-query hook. Returns false on the server and first paint,
 * then resolves to the real match on mount and updates on change.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- lib/hooks/use-media-query.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/hooks/use-media-query.ts lib/hooks/use-media-query.test.ts
git commit -m "feat: add SSR-safe useMediaQuery hook"
```

---

## Task 2: Card components + registry

**Files:**
- Create: `components/chat-cards/projects-card.tsx`
- Create: `components/chat-cards/services-card.tsx`
- Create: `components/chat-cards/contact-card.tsx`
- Create: `components/chat-cards/index.ts`
- Test: `components/chat-cards/cards.test.tsx`
- Modify: `app/globals.css` (append card styles)

**Interfaces:**
- Consumes: `PROJECTS`, `SERVICES`, `CONTACTS` from `@/lib/data`; `Lang` from `@/lib/data`.
- Produces:
  - `ProjectsCard(props: { lang: Lang }): JSX.Element`
  - `ServicesCard(props: { lang: Lang }): JSX.Element`
  - `ContactCard(props: { lang: Lang }): JSX.Element`
  - `CARD_SECTIONS: Set<string>` = `{'projects','services','contact'}`
  - `CARD_COMPONENTS: Record<string, React.FC<{ lang: Lang }>>`

- [ ] **Step 1: Write the failing test**

```tsx
// components/chat-cards/cards.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CARD_SECTIONS, CARD_COMPONENTS } from './index';

describe('chat cards registry', () => {
  it('exposes the pilot sections', () => {
    expect([...CARD_SECTIONS].sort()).toEqual(['contact', 'projects', 'services']);
    expect(typeof CARD_COMPONENTS.projects).toBe('function');
    expect(typeof CARD_COMPONENTS.services).toBe('function');
    expect(typeof CARD_COMPONENTS.contact).toBe('function');
  });

  it('renders each card with real data', () => {
    const Projects = CARD_COMPONENTS.projects;
    const { unmount: u1 } = render(<Projects lang="en" />);
    expect(screen.getByText(/Sales chatbots on WhatsApp/)).toBeInTheDocument();
    u1();

    const Services = CARD_COMPONENTS.services;
    const { unmount: u2 } = render(<Services lang="en" />);
    expect(screen.getByText(/1:1 AI Career Mentorship/)).toBeInTheDocument();
    expect(screen.getByText('$240')).toBeInTheDocument();
    u2();

    const Contact = CARD_COMPONENTS.contact;
    render(<Contact lang="en" />);
    expect(screen.getByText(/in\/gutembergsmendoza/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- components/chat-cards/cards.test.tsx`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Implement the three card components**

```tsx
// components/chat-cards/projects-card.tsx
import { PROJECTS, type Lang } from '@/lib/data';

export function ProjectsCard({ lang }: { lang: Lang }) {
  return (
    <div className="chat-card">
      <div className="chat-card-head">◆ {lang === 'en' ? 'projects' : 'proyectos'}</div>
      {PROJECTS.slice(0, 3).map((p) => (
        <div key={p.title} className="chat-card-row">
          <div className="chat-card-tag">{p.tag}</div>
          <div className="chat-card-title">{p.title}</div>
          <div className="chat-card-stack">{p.stack.join(' · ')}</div>
        </div>
      ))}
    </div>
  );
}
```

```tsx
// components/chat-cards/services-card.tsx
import { SERVICES, type Lang } from '@/lib/data';

export function ServicesCard({ lang }: { lang: Lang }) {
  return (
    <div className="chat-card">
      <div className="chat-card-head">◆ {lang === 'en' ? 'services' : 'servicios'}</div>
      {SERVICES.map((s) => (
        <div key={s.num} className="chat-card-row">
          <div className="chat-card-title">{lang === 'en' ? s.titleEn : s.titleEs}</div>
          <div className="chat-card-price">
            <span className="chat-card-amt">{s.price}</span>{' '}
            <span className="chat-card-per">{lang === 'en' ? s.perEn : s.perEs}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

```tsx
// components/chat-cards/contact-card.tsx
import { CONTACTS, type Lang } from '@/lib/data';

export function ContactCard({ lang }: { lang: Lang }) {
  const shown = CONTACTS.filter(([key]) => key === 'email' || key === 'linkedin' || key === 'github');
  return (
    <div className="chat-card">
      <div className="chat-card-head">◆ {lang === 'en' ? 'contact' : 'contacto'}</div>
      {shown.map(([key, label, href]) => (
        <a key={key} className="chat-card-contact" href={href} target="_blank" rel="noopener noreferrer">
          <span className="chat-card-contact-key">{key}</span>
          <span className="chat-card-contact-val">{label}</span>
        </a>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Implement the registry**

```tsx
// components/chat-cards/index.ts
import type { Lang } from '@/lib/data';
import { ProjectsCard } from './projects-card';
import { ServicesCard } from './services-card';
import { ContactCard } from './contact-card';

export const CARD_SECTIONS = new Set(['projects', 'services', 'contact']);

export const CARD_COMPONENTS: Record<string, React.FC<{ lang: Lang }>> = {
  projects: ProjectsCard,
  services: ServicesCard,
  contact: ContactCard,
};
```

- [ ] **Step 5: Append card styles to `app/globals.css`**

```css
/* ---- Generative chat cards (mobile) ---- */
.chat-card {
  border: 1px solid var(--line);
  border-left: 2px solid var(--accent);
  background: var(--bg-3);
  padding: 12px 14px;
  margin: 8px 0;
  font-family: var(--mono);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.chat-card-head {
  color: var(--accent);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.chat-card-row { display: flex; flex-direction: column; gap: 2px; }
.chat-card-tag { color: var(--fg-3); font-size: 10px; letter-spacing: 0.1em; }
.chat-card-title { color: var(--fg); font-size: 13px; }
.chat-card-stack { color: var(--fg-3); font-size: 11px; }
.chat-card-price { font-size: 12px; }
.chat-card-amt { color: var(--fg); }
.chat-card-per { color: var(--fg-3); }
.chat-card-contact {
  display: flex; justify-content: space-between; gap: 12px;
  min-height: 44px; align-items: center;
  color: var(--fg-2); font-size: 12px; border-top: 1px dashed var(--line);
}
.chat-card-contact:first-of-type { border-top: none; }
.chat-card-contact-key { color: var(--fg-3); text-transform: uppercase; font-size: 10px; letter-spacing: 0.1em; }
.chat-card-contact-val { color: var(--accent); }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- components/chat-cards/cards.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add components/chat-cards app/globals.css
git commit -m "feat: add projects/services/contact chat cards + registry"
```

---

## Task 3: Inject and render cards in the chat (mobile only)

**Files:**
- Modify: `components/chat.tsx`
- Modify: `components/chat.test.tsx`

**Interfaces:**
- Consumes: `useMediaQuery` (Task 1); `CARD_SECTIONS`, `CARD_COMPONENTS` (Task 2).
- Produces: on a mobile viewport, a `navigate(projects|services|contact)` tool call appends a card to the transcript instead of scrolling; desktop still scrolls.

- [ ] **Step 1: Add imports and the mobile flag**

At the top of `components/chat.tsx`, add imports:

```tsx
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { CARD_SECTIONS, CARD_COMPONENTS } from '@/components/chat-cards';
```

Inside the component, after `const { agent } = useAgent();`, add:

```tsx
  const isMobile = useMediaQuery('(max-width: 1024px)');
  const [cardMsgs, setCardMsgs] = useState<{ id: string; section: string }[]>([]);
```

- [ ] **Step 2: Inject a card (mobile) instead of scrolling, in the navigate effect**

In the "React to navigate tool calls" effect, replace the scroll block:

```tsx
        if (args?.section && NAV_MAP[`/${args.section}`]) scrollTo(args.section);
        else if (args?.section) scrollTo(args.section);
```

with:

```tsx
        const section = args?.section as string | undefined;
        if (!section) continue;
        if (isMobile && CARD_SECTIONS.has(section)) {
          setCardMsgs((prev) => (prev.some((c) => c.id === id) ? prev : [...prev, { id, section }]));
        } else {
          scrollTo(section);
        }
```

Add `isMobile` to that effect's dependency array: `}, [rawMessages.length, isRunning, isMobile]);`

- [ ] **Step 3: Clear cards when the conversation is cleared/resumed**

In `handleCommand` `/clear` and in `resumeSession`, after `setMessages(...)`, add:

```tsx
      setCardMsgs([]);
```

- [ ] **Step 4: Render cards at the end of the transcript**

In the chat-body render, after the `{messages.map(...)}` block and before the closing `</div>` of `.chat-body`, add:

```tsx
          {cardMsgs.map((c) => {
            const Card = CARD_COMPONENTS[c.section];
            return Card ? (
              <div key={c.id} className="chat-card-msg">
                <Card lang={lang} />
              </div>
            ) : null;
          })}
```

- [ ] **Step 5: Update the component test (mobile renders a card)**

Replace `components/chat.test.tsx` with a test that stubs `matchMedia` to mobile, mocks `useAgent` to return an assistant message carrying a `navigate` tool call for `services`, and asserts the ServicesCard content appears:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('matchMedia', vi.fn(() => ({
  matches: true,
  addEventListener: () => {},
  removeEventListener: () => {},
})));

vi.mock('@copilotkit/react-core/v2', () => ({
  useAgent: () => ({
    agent: {
      isRunning: false,
      messages: [
        {
          id: 'a1',
          role: 'assistant',
          content: 'here are the services',
          toolCalls: [{ id: 't1', function: { name: 'navigate', arguments: '{"section":"services"}' } }],
        },
      ],
      addMessage: vi.fn(),
      setMessages: vi.fn(),
      runAgent: vi.fn(async () => {}),
    },
  }),
}));

import { Chat } from './chat';

const noop = () => {};

describe('Chat generative cards (mobile)', () => {
  it('renders a services card when the agent navigates to services on mobile', async () => {
    render(
      <Chat
        primary
        lang="en"
        setLang={noop}
        scrollTo={noop}
        setTheme={noop}
        setTlFilter={noop}
        setBlogFilter={noop}
        selectedModel={{ id: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4.5', provider: 'anthropic', ctx: '200k', free: false }}
        onModelChange={noop}
        anonId=""
        sessionId=""
        setSessionId={noop}
      />,
    );
    expect(await screen.findByText(/1:1 AI Career Mentorship/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run tests**

Run: `npm run test -- components/chat.test.tsx`
Expected: PASS. Then `npx tsc --noEmit` (expect no errors in `components/chat.tsx`).

- [ ] **Step 7: Commit**

```bash
git add components/chat.tsx components/chat.test.tsx
git commit -m "feat: render generative section cards in the chat on mobile"
```

---

## Task 4: Mobile chat-primary landing

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css` (mobile full-screen chat)

**Interfaces:**
- Consumes: `useMediaQuery` (Task 1).
- Produces: on mobile the chat is open (full-screen) on load; the existing close/overlay reveals the site; FAB/tweaks reopens it.

- [ ] **Step 1: Open the mobile chat by default on mobile**

In `app/page.tsx`, add the import:

```tsx
import { useMediaQuery } from '@/lib/hooks/use-media-query';
```

Inside `Page`, after the existing state, add:

```tsx
  const isMobile = useMediaQuery('(max-width: 1024px)');
  useEffect(() => {
    if (isMobile) setMobileChat(true);
  }, [isMobile]);
```

(`mobileChat`/`setMobileChat` already exist.)

- [ ] **Step 2: Ensure the mobile chat is full-screen and safe-area aware**

In `app/globals.css`, find the `.chat-mobile` rules and ensure the open state is full-screen with dynamic viewport height + safe areas. Append (or adjust) this block:

```css
@media (max-width: 1024px) {
  .chat-mobile.open {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100dvh;
    padding-bottom: env(safe-area-inset-bottom);
    z-index: 60;
  }
  .chat-mobile.open .chat-input-wrap input { font-size: 16px; } /* avoid iOS zoom */
  .chat-card-msg { width: 100%; }
}
```

- [ ] **Step 3: Verify build + type-check**

Run: `npx tsc --noEmit && npm run test`
Expected: no type errors; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx app/globals.css
git commit -m "feat: mobile chat-primary landing (open full-screen by default)"
```

---

## Task 5: End-to-end verification + responsive audit

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (loads `.env.local` + `.env`; ensure local Supabase is running via `npm run supabase:start`).

- [ ] **Step 2: Verify mobile generative cards (emulated mobile viewport, ~390×844)**

Drive the app in a mobile viewport and confirm, recording results:
1. Chat is full-screen on load (landing).
2. Ask "servicios" → a ServicesCard renders inline with the three services + prices.
3. Ask "proyectos" → a ProjectsCard renders with project titles + stacks.
4. Ask "contacto" → a ContactCard renders with email/linkedin/github links.
5. Close the chat (×/overlay) → the site is revealed; FAB/tweaks reopens the chat.
6. No horizontal page scroll; the input sits above the home bar (safe area); tapping the input does not zoom.

- [ ] **Step 3: Verify desktop is unchanged (viewport ≥1280px)**

Confirm: asking about projects/services/contact **scrolls** the site to the section and renders **no** card in the chat.

- [ ] **Step 4: Final suite + build**

Run: `npm run test && npx tsc --noEmit && npm run build`
Expected: all green; build compiles.

- [ ] **Step 5: Commit any verification fixes, then stop for review**

```bash
git add -A
git commit -m "test: verify mobile generative cards + responsive behavior"
```

---

## Self-Review Notes

**Spec coverage:** agent-behavior-unchanged/navigate reuse (Task 3), generative cards controlled pattern for projects/services/contact (Task 2 + 3), mobile-only via useMediaQuery (Task 1 + 3 + 4), display-only cards not in agent.messages (Task 3 — separate `cardMsgs` state), mobile-first full-screen landing + safe-area/100dvh/16px input (Task 4), registry for extensibility (Task 2), reuse of lib/data (Task 2), testing incl. browser mobile verification (Task 5). All spec sections map to a task.

**Deliberate simplification:** cards render at the end of the transcript (arrival order) rather than anchored to the specific triggering assistant message — the assistant tool-call message may have empty text and be filtered from the view list, so end-placement is robust and, since the transcript auto-scrolls to bottom, reads correctly for the pilot.

**Known confirm-in-implementation point:** exact current line numbers in `chat.tsx`/`globals.css` shift over edits; steps anchor on code snippets (the scroll block, the `.chat-body` map, the `.chat-mobile` rules) rather than line numbers.
