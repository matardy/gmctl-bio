# Mobile-First Chat + Generative UI Design

Date: 2026-07-16
Project: `personal-web`
Scope: make the chat the primary experience on mobile, and let the agent render pilot section content (projects, services, contact) as interactive cards inline in the chat ("generative UI", controlled pattern). Desktop keeps the current split layout with scroll-to-section.

## Goal

Most visitors arrive on mobile, so the chat should be the main way they explore Gutemberg's site there. On mobile the chat opens full-screen by default; when the user asks about projects, services, or contact, the agent surfaces a compact card **inside the chat** (reusing the site's data) so they never have to leave the conversation. The full site stays one tap away.

This is a pilot: only Projects, Services, and Contact get cards, to validate the generative-UI pattern with minimal surface area.

## Non-Goals

- Cards for every section (only projects/services/contact in this pilot; about/timeline/writing/voices are text answers + desktop scroll)
- Changing the desktop experience (desktop keeps the site + chat sidebar and scroll-to-section)
- New backend tools or prompt changes (the agent keeps calling the existing `navigate` tool)
- A full site redesign or new visual language (cards reuse the existing terminal aesthetic)
- Server-driven / LLM-generated arbitrary UI (this is the *controlled* pattern: we author the components, the agent only picks the section)

## Constraints

- Follows the existing terminal aesthetic (mono, `◆`, `--accent` red, `--bg`/`--fg` tokens) and is theme-aware (dark/light)
- Reuses `lib/data.ts` (`PROJECTS`, `SERVICES`, `CONTACTS`) — no data duplication
- Cards render **only on mobile viewports**; desktop behavior is unchanged (`navigate` → `scrollTo`)
- The page mounts two `<Chat>` instances (desktop + mobile) sharing one agent; card rendering must not double up
- Responsive best practices: `100dvh` (not `100vh`), `env(safe-area-inset-*)`, touch targets ≥44px, input `font-size ≥16px` (avoid iOS zoom), no horizontal page scroll, wide content scrolls inside its own container

## Existing Context

- `components/chat.tsx` — terminal chat on CopilotKit headless (`useAgent`). It already observes the agent's `navigate` tool calls (`processedToolCalls`) and, on desktop, calls `scrollTo(section)`. It owns its own message render (custom terminal), so it can render arbitrary React per message.
- `app/page.tsx` — renders `<Chat primary>` (desktop) and a second `<Chat>` (mobile, `chat-mobile` class) inside one `<CopilotKit>` provider; owns `mobileChat` open/close state, plus shared `anonId`/`sessionId`.
- `lib/data.ts` — `PROJECTS`, `SERVICES`, `CONTACTS` (and `EXPERIENCE`, `POSTS`, `VOICES`, `EDUCATION`, `COPY`).
- `lib/agent/tools/navigate.ts` — the server-side `navigate` tool (sections enum); the agent calls it when the answer is about a section. No change needed.
- `app/globals.css` — terminal + chat + mobile styles (`.chat`, `.chat-mobile`, `.chat-overlay`, `.chat-fab`, `.msg`, etc.).

## Architecture

### 1. Agent behavior — unchanged

The agent keeps calling the existing `navigate(section)` tool when the answer is primarily about a section. No new tools, no prompt changes. The viewport-aware behavior lives entirely in the frontend:

- **Desktop:** `navigate(section)` → `scrollTo(section)` (current behavior).
- **Mobile:** `navigate(projects|services|contact)` → inject a **card message** into the chat transcript. Other sections on mobile → no card (the agent's text answer stands; the site is a tap away).

### 2. Generative cards — controlled pattern

New compact, terminal-styled card components rendered inline in the chat transcript:

- `ProjectsCard` — top projects from `PROJECTS` (title, year, tags), each linking to the projects section.
- `ServicesCard` — the services from `SERVICES` (title, price, one-line), with a "book"/contact affordance.
- `ContactCard` — email + LinkedIn + a primary CTA from `CONTACTS`.

Rendering path: `chat.tsx`'s `ViewMsg` gains an optional `card?: 'projects' | 'services' | 'contact'` field. When the mobile instance observes a `navigate` tool call for a pilot section, it appends a display-only card message (local, not sent to the model). The transcript renderer shows the card component for `card` messages and text otherwise.

A registry (`components/chat-cards/index.ts`) maps `section → card component`, so adding a section later is one entry + one component.

### 3. Mobile-first layout

- Viewport `≤1024px` (mobile): the chat is the **primary full-screen view on load** (`mobileChat` open by default on mobile). A discreet **"explore site / ver sitio"** control closes the chat overlay to reveal the site; the existing FAB/`tweaks` reopens it.
- Desktop (`>1024px`): unchanged (site + fixed chat sidebar; cards never render, `navigate` scrolls).
- `use-media-query` hook (`lib/hooks/use-media-query.ts`) tells the chat whether it is on a mobile viewport, so **only the mobile instance renders cards** (no double cards, and desktop never shows them).
- The chat full-screen container uses `100dvh` + `env(safe-area-inset-bottom)` so the input clears the iOS home bar and mobile browser chrome.

### 4. Module structure

```
components/chat-cards/projects-card.tsx    NEW  compact projects card (reads PROJECTS)
components/chat-cards/services-card.tsx    NEW  compact services card (reads SERVICES)
components/chat-cards/contact-card.tsx     NEW  compact contact card (reads CONTACTS)
components/chat-cards/index.ts             NEW  registry: section -> card component + CARD_SECTIONS set
lib/hooks/use-media-query.ts               NEW  useMediaQuery(query) -> boolean (SSR-safe)
components/chat.tsx                         MOD  ViewMsg.card, inject card on mobile navigate, render cards
app/page.tsx                               MOD  mobile chat-primary (open by default) + explore-site control
app/globals.css                            MOD  card styles + mobile full-screen (100dvh, safe-area, touch targets)
```

### 5. Data flow

```
user asks about services (mobile)
  -> agent calls navigate("services") tool
  -> mobile <Chat> observes the tool call (isMobile === true, section ∈ CARD_SECTIONS)
     -> append display-only ViewMsg { card: 'services' } to the transcript
  -> transcript renders <ServicesCard/> inline (reads SERVICES from lib/data)
desktop: same tool call -> scrollTo('services') (no card)
```

Card messages are display-only: they are NOT added to `agent.messages` (kept out of the model context, consistent with the greeting fix). They live in a small local `cardMsgs` list keyed by tool-call id, merged into the render in arrival order after the triggering assistant message.

### 6. Error handling

- Unknown section or a section without a card → no card (falls back to text answer / desktop scroll). No crash.
- `useMediaQuery` is SSR-safe (returns a stable default during SSR, resolves on mount) to avoid hydration mismatch.
- Duplicate tool-call handling reuses the existing `processedToolCalls` guard so a card is injected once.

### 7. Testing

- Unit: `use-media-query` (matches/updates on change), the card registry (`section → component`, `CARD_SECTIONS` membership), and each card renders with real `lib/data` (asserts a known project/service/contact string).
- Component: `chat.tsx` renders a card message as the card component (mocked `useAgent`, `isMobile=true`).
- In-browser (mobile viewport emulation, local Supabase + real Anthropic): chat full-screen on load; ask "servicios" → ServicesCard inline; "proyectos" → ProjectsCard; "contacto" → ContactCard; explore-site control reveals the site; desktop unchanged (scroll, no cards).

## Risks

- **Double-mounted chat instances:** card injection must be gated to the mobile instance via `useMediaQuery`, or both instances could inject. Mitigation: only render/inject cards when `isMobile` and in the mobile-class instance.
- **Hydration mismatch** from viewport detection: mitigated by an SSR-safe `useMediaQuery` default.
- **Transcript ordering** of display-only card messages vs agent messages: cards are appended on tool-call observation, which fires as the assistant message arrives, so order is natural; keyed by tool-call id to avoid dupes.
- **Mobile-primary regressions** to the existing FAB/overlay/peek flow: the change inverts the default (`mobileChat` open on mobile) and adds an explore-site control; verify the open/close/reveal loop still works.
```
