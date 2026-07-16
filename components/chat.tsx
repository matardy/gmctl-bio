'use client';

import { useAgent } from '@copilotkit/react-core/v2';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from '@/lib/data';
import { EXPERIENCE } from '@/lib/data';
import { t } from '@/lib/i18n';
import { MODELS_BY_PROVIDER, PROVIDER_LABELS, type ModelConfig } from '@/lib/models';

interface ChatProps {
  lang: Lang;
  setLang: (l: Lang) => void;
  scrollTo: (id: string) => void;
  setTheme: (t: 'dark' | 'light') => void;
  setTlFilter: (f: string) => void;
  setBlogFilter: (f: string) => void;
  selectedModel: ModelConfig;
  onModelChange: (m: ModelConfig) => void;
  anonId: string;
  sessionId: string;
  className?: string;
  onClose?: () => void;
}

interface QuotaState {
  tokensUsed24h: number;
  tokensLimit24h: number;
  tokensRemaining24h: number;
  quotaExhausted: boolean;
}

interface ViewMsg {
  id: string;
  kind: 'sys' | 'bot' | 'user';
  text: string;
}

const QUICK_EN = ['/about', '/work', '/services', '/writing', '/contact', '/help'];
const QUICK_ES = ['/sobre', '/trabajo', '/servicios', '/escritos', '/contacto', '/ayuda'];

const NAV_MAP: Record<string, string> = {
  '/home': 'home', '/inicio': 'home',
  '/about': 'about', '/sobre': 'about',
  '/work': 'timeline', '/timeline': 'timeline', '/trabajo': 'timeline', '/trayectoria': 'timeline',
  '/projects': 'projects', '/proyectos': 'projects',
  '/services': 'services', '/servicios': 'services',
  '/writing': 'writing', '/blog': 'writing', '/escritos': 'writing',
  '/voices': 'voices', '/voces': 'voices',
  '/contact': 'contact', '/contacto': 'contact',
};

const NAV_QUIPS: Record<string, { en: string[]; es: string[] }> = {
  home: { en: ['back to the beginning.'], es: ['de vuelta al principio.'] },
  about: { en: ['loading background.'], es: ['cargando trayectoria.'] },
  timeline: { en: ['career timeline.'], es: ['línea de tiempo.'] },
  projects: { en: ['things he built.'], es: ['cosas que construyó.'] },
  services: { en: ['the menu. yes, there are prices.'], es: ['el menú. sí, hay precios.'] },
  writing: { en: ['notes and posts.'], es: ['notas y posts.'] },
  voices: { en: ['what others say.'], es: ['lo que otros dicen.'] },
  contact: { en: ["let's talk."], es: ['hablemos.'] },
};

function getNavQuip(dest: string, lang: Lang): string {
  const quips = NAV_QUIPS[dest];
  if (!quips) return `→ ${dest}`;
  const arr = quips[lang];
  return `→ ${dest} · ${arr[Math.floor(Math.random() * arr.length)]}`;
}

const NAV_VERB_EN = /\b(go to|take me|show me|navigate to|open|visit|see)\b/i;
const NAV_VERB_ES = /\b(ll[eé]vame|mu[eé]strame|ir a|ve a|abrir|visitar|ver|mostrar)\b/i;
const SECTION_PATTERNS: [RegExp, string][] = [
  [/\b(home|inicio|principal)\b/i, 'home'],
  [/\b(about|sobre|acerca)\b/i, 'about'],
  [/\b(work|timeline|trayectoria|experiencia|carrera|trabajo)\b/i, 'timeline'],
  [/\b(project|proyecto)\b/i, 'projects'],
  [/\b(service|servicio|mentor)\b/i, 'services'],
  [/\b(writing|blog|escrito|artículo|article)\b/i, 'writing'],
  [/\b(voice|voces|testimoni)\b/i, 'voices'],
  [/\b(contact|contacto)\b/i, 'contact'],
];

function detectNavIntent(text: string): string | null {
  if (!NAV_VERB_EN.test(text) && !NAV_VERB_ES.test(text)) return null;
  for (const [pattern, dest] of SECTION_PATTERNS) {
    if (pattern.test(text)) return dest;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function contentToText(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === 'string' ? p : p && typeof p === 'object' && 'text' in p ? String(p.text) : ''))
      .join('');
  }
  return '';
}

export function Chat({
  lang, setLang, scrollTo, setTheme, setTlFilter, setBlogFilter,
  selectedModel, onModelChange, anonId, sessionId, className = '', onClose,
}: ChatProps) {
  const i18n = t(lang);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputVal, setInputVal] = useState('');
  const [modelOpen, setModelOpen] = useState(false);
  const processedToolCalls = useRef(new Set<string>());
  const greetedRef = useRef(false);
  const [, forceRender] = useState(0);
  const [quota, setQuota] = useState<QuotaState>({
    tokensUsed24h: 0, tokensLimit24h: 0, tokensRemaining24h: 0, quotaExhausted: false,
  });

  const { agent } = useAgent();

  const greetText = lang === 'en'
    ? 'gmctl agent · v1.0 · ready'
    : 'agente gmctl · v1.0 · listo';
  const greetBody = lang === 'en'
    ? 'hello, operator. ask anything about gutemberg, or use commands like /about, /work, /services.'
    : 'hola, operador. pregúntame sobre gutemberg, o usa comandos como /sobre, /trabajo, /servicios.';
  const greetTip = lang === 'en'
    ? 'tip: type /help to see everything I can do.'
    : 'tip: escribe /ayuda para ver todo lo que puedo hacer.';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addMsg = useCallback((role: 'user' | 'assistant' | 'system', text: string, id?: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (agent as any)?.addMessage({ id: id ?? crypto.randomUUID(), role, content: text });
    forceRender((n) => n + 1);
  }, [agent]);

  // Seed the greeting once the agent is available and empty.
  useEffect(() => {
    if (!agent || greetedRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (((agent as any).messages ?? []).length === 0) {
      addMsg('system', greetText, 'greet-0');
      addMsg('assistant', greetBody, 'greet-1');
      addMsg('assistant', greetTip, 'greet-2');
    }
    greetedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent]);

  const refreshQuota = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/quota?anon_id=${id}`);
      if (!res.ok) return;
      const data = await res.json() as {
        tokens_used_24h?: number; tokens_limit_24h?: number;
        tokens_remaining_24h?: number; quota_exhausted?: boolean;
      };
      setQuota({
        tokensUsed24h: data.tokens_used_24h ?? 0,
        tokensLimit24h: data.tokens_limit_24h ?? 0,
        tokensRemaining24h: data.tokens_remaining_24h ?? 0,
        quotaExhausted: data.quota_exhausted ?? false,
      });
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    if (anonId) refreshQuota(anonId).catch(() => {});
  }, [anonId, refreshQuota]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawMessages: any[] = (agent as any)?.messages ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isRunning: boolean = Boolean((agent as any)?.isRunning);

  const messages: ViewMsg[] = rawMessages
    .map((m) => {
      const text = contentToText(m.content)
        .replace(/\{[^{}]*"name"\s*:\s*"[^"]*"[^{}]*"(parameters|arguments)"\s*:[^}]*\}[^}]*\}/g, '')
        .trim();
      const kind: ViewMsg['kind'] = m.id === 'greet-0' ? 'sys' : m.role === 'user' ? 'user' : 'bot';
      return { id: m.id, kind, text };
    })
    .filter((m) => m.text.length > 0);

  // React to navigate tool calls → scroll + refresh quota after each run.
  useEffect(() => {
    for (const m of rawMessages) {
      const toolCalls = m.toolCalls ?? m.tool_calls ?? [];
      for (const call of toolCalls) {
        const id = call.id ?? call.toolCallId;
        const name = call.function?.name ?? call.name;
        if (name !== 'navigate' || !id || processedToolCalls.current.has(id)) continue;
        processedToolCalls.current.add(id);
        let args = call.function?.arguments ?? call.args ?? {};
        if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
        if (args?.section && NAV_MAP[`/${args.section}`]) scrollTo(args.section);
        else if (args?.section) scrollTo(args.section);
      }
    }
    if (!isRunning && anonId) refreshQuota(anonId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawMessages.length, isRunning]);

  // Scroll to bottom on new content.
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rawMessages.length, isRunning]);

  // Navigation quips fired by manual UI navigation.
  useEffect(() => {
    async function handleNavEvent(e: Event) {
      const { dest } = (e as CustomEvent<{ dest: string }>).detail;
      try {
        const res = await fetch('/api/quip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ section: dest, lang }),
        });
        const { quip } = await res.json() as { quip: string };
        addMsg('assistant', quip);
      } catch {
        addMsg('assistant', getNavQuip(dest, lang));
      }
    }
    window.addEventListener('gmctl:nav', handleNavEvent);
    return () => window.removeEventListener('gmctl:nav', handleNavEvent);
  }, [lang, addMsg]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!modelOpen) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.model-panel, .model-badge')) setModelOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modelOpen]);

  function handleCommand(raw: string): boolean {
    const cmd = raw.trim().toLowerCase();
    const parts = cmd.split(/\s+/);
    const arg = parts.slice(1).join(' ');
    const first = parts[0];

    const dest = NAV_MAP[first];
    if (dest) {
      scrollTo(dest);
      addMsg('user', raw);
      addMsg('assistant', getNavQuip(dest, lang));
      return true;
    }
    if (cmd === '/help' || cmd === '?' || cmd === '/ayuda') {
      addMsg('user', raw);
      addMsg('assistant', lang === 'en'
        ? 'commands: /about /work /projects /services /writing /contact · /filter <company> · /lang es · /theme light · /cv · /clear'
        : 'comandos: /sobre /trabajo /proyectos /servicios /escritos /contacto · /filtro <empresa> · /lang en · /tema claro · /cv · /clear');
      return true;
    }
    if (cmd === '/clear') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (agent as any)?.setMessages([]);
      greetedRef.current = false;
      forceRender((n) => n + 1);
      return true;
    }
    if (first === '/lang') {
      const l = arg.startsWith('es') ? 'es' : arg.startsWith('en') ? 'en' : null;
      if (l) { setLang(l as Lang); addMsg('user', raw); addMsg('assistant', `language → ${l}`); }
      return true;
    }
    if (first === '/theme' || first === '/tema') {
      const th = (arg === 'light' || arg === 'claro') ? 'light' : (arg === 'dark' || arg === 'oscuro') ? 'dark' : null;
      if (th) { setTheme(th); addMsg('user', raw); addMsg('assistant', `theme → ${th}`); return true; }
    }
    if (first === '/filter' || first === '/filtro') {
      if (!arg) { setBlogFilter(''); setTlFilter('all'); addMsg('user', raw); addMsg('assistant', 'filters cleared.'); return true; }
      const matches = EXPERIENCE.filter(e => e.org.toLowerCase().includes(arg) || e.id.includes(arg));
      addMsg('user', raw);
      if (matches.length) {
        setTlFilter(arg); scrollTo('timeline');
        addMsg('assistant', `→ timeline filtered: ${matches.length} match${matches.length > 1 ? 'es' : ''}.`);
      } else {
        setBlogFilter(arg); scrollTo('writing');
        addMsg('assistant', `→ blog filtered by "${arg}".`);
      }
      return true;
    }
    if (cmd === '/cv') {
      addMsg('user', raw);
      addMsg('assistant', 'CV: linkedin.com/in/gutembergsmendoza');
      return true;
    }
    return false;
  }

  function send(text: string) {
    addMsg('user', text);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (agent as any)?.runAgent({
      forwardedProps: {
        provider: selectedModel.provider,
        model: selectedModel.id,
        anonId: anonId || undefined,
        sessionId: sessionId || undefined,
      },
    }).catch(() => {}).finally(() => { if (anonId) refreshQuota(anonId).catch(() => {}); });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const val = inputVal.trim();
    if (!val || isRunning) return;
    setInputVal('');
    if (handleCommand(val)) return;
    const navDest = detectNavIntent(val);
    if (navDest) {
      scrollTo(navDest);
      addMsg('user', val);
      addMsg('assistant', getNavQuip(navDest, lang));
      return;
    }
    send(val);
  }

  function quickRun(cmd: string) {
    if (!handleCommand(cmd) && !isRunning) send(cmd);
  }

  const quick = lang === 'en' ? QUICK_EN : QUICK_ES;
  const providers = (['nvidia', 'openrouter', 'anthropic'] as const);

  return (
    <aside className={`chat ${className}`} aria-label="assistant">
      {onClose && <div className="chat-drag-handle" />}

      <div className="chat-head">
        <div className="chat-head-top">
          <span className="chat-head-label">// gmctl agent</span>
          <div className="chat-head-actions">
            <button
              className={`model-badge${modelOpen ? ' open' : ''}`}
              onClick={() => setModelOpen(o => !o)}
              data-tip={i18n.modelTips.badge}
            >
              {selectedModel.label} ▾
            </button>
            {modelOpen && (
              <div className="model-panel">
                {providers.map(prov => (
                  <div key={prov} className="model-group">
                    <div className="model-group-label">{PROVIDER_LABELS[prov]}</div>
                    {MODELS_BY_PROVIDER[prov].map(m => (
                      <button
                        key={m.id}
                        className={`model-option${m.id === selectedModel.id ? ' active' : ''}`}
                        onClick={() => { onModelChange(m); setModelOpen(false); }}
                      >
                        <span className="model-option-name">{m.label}</span>
                        <span className="model-option-ctx">{m.ctx}</span>
                        {!m.free && <span className="model-option-paid">$</span>}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <span className="chat-live">{i18n.chat.live}</span>
            {onClose && <button className="chat-close-btn" onClick={onClose}>×</button>}
          </div>
        </div>
        <div className="chat-head-meta">
          <div className="chat-usage" aria-live="polite">
            <span>{i18n.chat.quota.used}: {quota.tokensUsed24h}</span>
            <span>{i18n.chat.quota.remaining}: {quota.tokensRemaining24h}</span>
          </div>
        </div>
      </div>

      {quota.quotaExhausted && (
        <div className="chat-quota-banner" aria-live="polite">
          <strong>{i18n.chat.quota.title}</strong>
          <span>{i18n.chat.quota.body}</span>
          <button type="button" onClick={() => scrollTo('contact')}>
            {i18n.chat.quota.contact}
          </button>
        </div>
      )}

      <div className="chat-body" ref={bodyRef}>
        {messages.map((m, idx) => {
          const isLast = idx === messages.length - 1;
          return (
            <div key={m.id} className={`msg ${m.kind}`}>
              {m.text}
              {isLast && isRunning && <span className="stream-cursor">▋</span>}
            </div>
          );
        })}
      </div>

      <div className="chat-quick">
        {quick.map(c => (
          <button key={c} onClick={() => quickRun(c)}>{c}</button>
        ))}
      </div>

      <form className="chat-input-wrap" onSubmit={onSubmit}>
        <span className="prompt">$</span>
        <input
          ref={inputRef}
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          placeholder={i18n.chat.placeholder}
          disabled={isRunning}
          autoComplete="off"
          spellCheck={false}
        />
      </form>
    </aside>
  );
}
