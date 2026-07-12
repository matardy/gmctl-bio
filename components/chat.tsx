'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getExhaustedReply } from '@/lib/chat/exhausted-replies';
import type { Lang } from '@/lib/data';
import { EXPERIENCE } from '@/lib/data';
import { t } from '@/lib/i18n';
import { MODELS_BY_PROVIDER, PROVIDER_LABELS, type ModelConfig } from '@/lib/models';

interface ChatProps {
  lang: Lang;
  setLang: (l: Lang) => void;
  scrollTo: (id: string) => void;
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;
  setTlFilter: (f: string) => void;
  setBlogFilter: (f: string) => void;
  selectedModel: ModelConfig;
  onModelChange: (m: ModelConfig) => void;
  className?: string;
  onClose?: () => void;
}

interface SessionSummary {
  session_id: string;
  started_at: string;
  preview: string;
  count: number;
}

interface QuotaState {
  tokensUsed24h: number;
  tokensLimit24h: number;
  tokensRemaining24h: number;
  quotaExhausted: boolean;
}

interface StreamUsageState {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
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
  home: {
    en: ['back to the beginning. classic.', "home. gutemberg's digital base of operations.", 'resetting to factory defaults.'],
    es: ['de vuelta al principio. clásico.', 'inicio. el cuartel general digital de gutemberg.', 'restaurando configuración de fábrica.'],
  },
  about: {
    en: ['loading gutemberg lore... brace yourself.', 'about section. controlled self-promotion incoming.', 'the origin story. he chose AI on purpose.'],
    es: ['cargando el lore de gutemberg... prepárate.', 'sección sobre él. autopromoción controlada incoming.', 'la historia de origen. eligió IA a propósito.'],
  },
  timeline: {
    en: ['career timeline loading. spoiler: lots of coffee.', "the timeline. where he pretends he planned all of this.", "chronological proof he wasn't wasting time. mostly."],
    es: ['cargando línea de tiempo. spoiler: mucho café.', 'el timeline. donde finge que planeó todo esto.', 'prueba cronológica de que no estaba perdiendo el tiempo. más o menos.'],
  },
  projects: {
    en: ["portfolio incoming. some shipped, some 'in progress' since forever.", 'things he built. half still in beta.', "projects. warning: excessive use of 'multi-agent'."],
    es: ["portafolio incoming. algunos terminados, otros 'en progreso' desde siempre.", 'cosas que construyó. la mitad todavía en beta.', "proyectos. advertencia: uso excesivo de 'multi-agente'."],
  },
  services: {
    en: ['the menu. yes, there are prices.', 'services. how to rent a human AI system.', 'consulting page. bring your engineering problems.'],
    es: ['el menú. sí, hay precios.', 'servicios. cómo contratar un sistema de IA humano.', 'página de consultoría. trae tus problemas de ingeniería.'],
  },
  writing: {
    en: ['loading thoughts he had at 2am.', 'blog section. mostly RAG, occasionally existential.', 'written content. technically published, read by 3 people.'],
    es: ['cargando pensamientos que tuvo a las 2am.', 'sección del blog. mayormente RAG, ocasionalmente existencial.', 'contenido escrito. técnicamente publicado, leído por 3 personas.'],
  },
  voices: {
    en: ['social proof. handpicked. totally unbiased.', 'what other humans say about him. all glowing. coincidence.', 'testimonials incoming. trust the process.'],
    es: ['prueba social. seleccionada a mano. totalmente imparcial.', 'lo que otros humanos dicen de él. todo positivo. coincidencia.', 'testimoniales incoming. confía en el proceso.'],
  },
  contact: {
    en: ['contact page. he may or may not respond immediately.', 'opening communication channel. good luck.', "contact info loaded. don't be shy."],
    es: ['página de contacto. puede que responda inmediatamente o no.', 'abriendo canal de comunicación. buena suerte.', 'info de contacto cargada. no seas tímido.'],
  },
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

function getOrCreateAnonId(): string {
  const key = 'gmctl_anon_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

function formatSessionDate(iso: string, lang: Lang): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return lang === 'en' ? 'today' : 'hoy';
  if (diffDays === 1) return lang === 'en' ? 'yesterday' : 'ayer';
  return d.toLocaleDateString(lang === 'es' ? 'es-EC' : 'en-US', { month: 'short', day: 'numeric' });
}

export function Chat({
  lang, setLang, scrollTo, theme: _theme, setTheme, setTlFilter, setBlogFilter,
  selectedModel, onModelChange, className = '', onClose,
}: ChatProps) {
  const i18n = t(lang);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputVal, setInputVal] = useState('');
  const [modelOpen, setModelOpen] = useState(false);
  const processedToolCalls = useRef(new Set<string>());
  const [anonId, setAnonId] = useState('');
  const sessionId = useRef(crypto.randomUUID());
  const prevStatus = useRef<string>('');

  // History panel state
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [quota, setQuota] = useState<QuotaState>({
    tokensUsed24h: 0,
    tokensLimit24h: 0,
    tokensRemaining24h: 0,
    quotaExhausted: false,
  });
  const [streamUsage, setStreamUsage] = useState<StreamUsageState>({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  });

  const greetText = lang === 'en'
    ? 'gmctl agent · v1.0 · ready\n\nhello, operator. ask anything about gutemberg, or use commands like /about, /work, /services.\n\ntip: type /help to see everything I can do.'
    : 'agente gmctl · v1.0 · listo\n\nhola, operador. pregúntame sobre gutemberg, o usa comandos como /sobre, /trabajo, /servicios.\n\ntip: escribe /ayuda para ver todo lo que puedo hacer.';

  const makeInitialMsgs = (): UIMessage[] => [
    { id: 'greet', role: 'assistant', parts: [{ type: 'text', text: greetText }] },
  ];

  const messagesRef = useRef<typeof messages>([]);
  const { messages, sendMessage, setMessages, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: () => ({
        provider: selectedModel.provider,
        model: selectedModel.id,
        session_id: sessionId.current,
        anon_id: anonId || undefined,
      }),
    }),
    messages: makeInitialMsgs(),
  });

  const refreshQuota = useCallback(async (id: string) => {
    const res = await fetch(`/api/quota?anon_id=${id}`);
    if (!res.ok) {
      return;
    }
    const data = await res.json() as {
      tokens_used_24h?: number;
      tokens_limit_24h?: number;
      tokens_remaining_24h?: number;
      quota_exhausted?: boolean;
    };

    setQuota({
      tokensUsed24h: data.tokens_used_24h ?? 0,
      tokensLimit24h: data.tokens_limit_24h ?? 0,
      tokensRemaining24h: data.tokens_remaining_24h ?? 0,
      quotaExhausted: data.quota_exhausted ?? false,
    });
  }, []);

  const saveMessage = useCallback(async (role: 'user' | 'assistant', content: string) => {
    if (!anonId || !sessionId.current || !content) return;
    try {
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anon_id: anonId, session_id: sessionId.current, role, content }),
      });
    } catch {
      // non-critical
    }
  }, [anonId]);

  // Initialize anon identity and load last session on mount
  useEffect(() => {
    const id = getOrCreateAnonId();
    setAnonId(id);

    fetch(`/api/history?anon_id=${id}`)
      .then(r => r.json())
      .then(({ messages: hist }: { messages: { role: string; content: string }[] }) => {
        if (!hist?.length) return;
        const mapped: UIMessage[] = hist.map((m, i) => ({
          id: `hist-${i}`,
          role: m.role as 'user' | 'assistant',
          parts: [{ type: 'text' as const, text: m.content }],
        }));
        setMessages(mapped);
      })
      .catch(() => {});

    refreshQuota(id).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save assistant message when stream finishes
  useEffect(() => {
    if (prevStatus.current === 'streaming' && status === 'ready') {
      const last = messages[messages.length - 1];
      if (last?.role === 'assistant') {
        const text = last.parts
          .filter(p => p.type === 'text')
          .map(p => (p as { type: 'text'; text: string }).text)
          .join('');
        if (text) saveMessage('assistant', text);
      }

      if (anonId) {
        refreshQuota(anonId).catch(() => {});
      }
    }
    prevStatus.current = status;
  }, [status, messages, saveMessage, anonId, refreshQuota]);

  useEffect(() => {
    const lastAssistant = [...messages].reverse().find(message => message.role === 'assistant');
    const metadata = (lastAssistant as UIMessage & {
      metadata?: {
        quota?: Partial<QuotaState>;
        usage?: Partial<StreamUsageState>;
      };
    } | undefined)?.metadata;

    if (metadata?.quota) {
      setQuota(current => ({
        tokensUsed24h: metadata.quota?.tokensUsed24h ?? current.tokensUsed24h,
        tokensLimit24h: metadata.quota?.tokensLimit24h ?? current.tokensLimit24h,
        tokensRemaining24h: metadata.quota?.tokensRemaining24h ?? current.tokensRemaining24h,
        quotaExhausted: metadata.quota?.quotaExhausted ?? current.quotaExhausted,
      }));
    }

    if (metadata?.usage) {
      setStreamUsage({
        inputTokens: metadata.usage?.inputTokens ?? 0,
        outputTokens: metadata.usage?.outputTokens ?? 0,
        totalTokens: metadata.usage?.totalTokens ?? 0,
      });
    } else if (status !== 'streaming') {
      setStreamUsage({
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      });
    }
  }, [messages, status]);

  // Handle AI navigate tool results
  useEffect(() => {
    for (const msg of messages) {
      for (const part of msg.parts) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = part as any;
        const isNavTool = p.toolName === 'navigate' || p.type === 'tool-navigate';
        if (
          isNavTool &&
          p.state === 'output-available' &&
          p.toolCallId &&
          !processedToolCalls.current.has(p.toolCallId as string)
        ) {
          processedToolCalls.current.add(p.toolCallId as string);
          const output = p.output as { section: string };
          if (output?.section) scrollTo(output.section);
        }
      }
    }
  }, [messages, scrollTo]);

  // Keep messagesRef current for event listeners
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Listen for manual UI navigation events → call lightweight quip API
  useEffect(() => {
    async function handleNavEvent(e: Event) {
      const { dest } = (e as CustomEvent<{ dest: string }>).detail;
      try {
        const recent = messagesRef.current
          .filter(m => m.id !== 'greet')
          .slice(-4)
          .map(m => ({
            role: m.role,
            content: m.parts.filter(p => p.type === 'text').map(p => (p as { type: 'text'; text: string }).text).join('').slice(0, 100),
          }))
          .filter(m => m.content);

        const res = await fetch('/api/quip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ section: dest, lang, messages: recent }),
        });
        const { quip } = await res.json() as { quip: string };
        const msg: UIMessage = { id: `quip-${Date.now()}`, role: 'assistant', parts: [{ type: 'text', text: quip }] };
        setMessages(prev => [...prev, msg]);
      } catch {
        // silently ignore quip failures
      }
    }
    window.addEventListener('gmctl:nav', handleNavEvent);
    return () => window.removeEventListener('gmctl:nav', handleNavEvent);
  }, [lang, setMessages]);

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

  // Close model panel on outside click
  useEffect(() => {
    if (!modelOpen) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.model-panel, .model-badge')) {
        setModelOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modelOpen]);

  async function openHistory() {
    if (!anonId) return;
    setShowHistory(true);
    setHistLoading(true);
    try {
      const res = await fetch(`/api/sessions?anon_id=${anonId}`);
      const { sessions: data } = await res.json() as { sessions: SessionSummary[] };
      setSessions(data ?? []);
    } catch {
      setSessions([]);
    } finally {
      setHistLoading(false);
    }
  }

  async function resumeSession(sid: string) {
    if (!anonId) return;
    setShowHistory(false);
    try {
      const res = await fetch(`/api/history?anon_id=${anonId}&session_id=${sid}`);
      const { messages: hist } = await res.json() as { messages: { role: string; content: string }[] };
      if (!hist?.length) return;
      const mapped: UIMessage[] = hist.map((m, i) => ({
        id: `resume-${i}`,
        role: m.role as 'user' | 'assistant',
        parts: [{ type: 'text' as const, text: m.content }],
      }));
      sessionId.current = sid;
      setMessages(mapped);
    } catch {
      // ignore
    }
  }

  function pushBot(text: string) {
    const msg: UIMessage = { id: `bot-${Date.now()}`, role: 'assistant', parts: [{ type: 'text', text }] };
    setMessages(prev => [...prev, msg]);
  }

  function pushUser(text: string) {
    const msg: UIMessage = { id: `usr-${Date.now()}`, role: 'user', parts: [{ type: 'text', text }] };
    setMessages(prev => [...prev, msg]);
  }

  function handleCommand(raw: string): boolean {
    const cmd = raw.trim().toLowerCase();
    const parts = cmd.split(/\s+/);
    const arg = parts.slice(1).join(' ');
    const first = parts[0];

    const dest = NAV_MAP[first];
    if (dest) {
      scrollTo(dest);
      pushUser(raw);
      setTimeout(() => pushBot(getNavQuip(dest, lang)), 80);
      return true;
    }

    if (cmd === '/help' || cmd === '?' || cmd === '/ayuda') {
      pushUser(raw);
      setTimeout(() => pushBot(
        lang === 'en'
          ? 'commands: /about /work /projects /services /writing /contact · /filter <company> · /lang es · /theme light · /cv · /clear'
          : 'comandos: /sobre /trabajo /proyectos /servicios /escritos /contacto · /filtro <empresa> · /lang en · /tema claro · /cv · /clear'
      ), 80);
      return true;
    }

    if (cmd === '/clear') { setMessages(makeInitialMsgs()); return true; }

    if (first === '/lang') {
      const l = arg.startsWith('es') ? 'es' : arg.startsWith('en') ? 'en' : null;
      if (l) { setLang(l as Lang); pushUser(raw); setTimeout(() => pushBot(`language → ${l}`), 80); }
      return true;
    }

    if (first === '/theme' || first === '/tema') {
      const t = (arg === 'light' || arg === 'claro') ? 'light' : (arg === 'dark' || arg === 'oscuro') ? 'dark' : null;
      if (t) { setTheme(t as 'dark' | 'light'); pushUser(raw); setTimeout(() => pushBot(`theme → ${t}`), 80); return true; }
    }

    if (first === '/filter' || first === '/filtro') {
      if (!arg) { setBlogFilter(''); setTlFilter('all'); pushUser(raw); setTimeout(() => pushBot('filters cleared.'), 80); return true; }
      const matches = EXPERIENCE.filter(e => e.org.toLowerCase().includes(arg) || e.id.includes(arg));
      pushUser(raw);
      if (matches.length) {
        setTlFilter(arg); scrollTo('timeline');
        setTimeout(() => pushBot(`→ timeline filtered: ${matches.length} match${matches.length > 1 ? 'es' : ''}.`), 80);
      } else {
        setBlogFilter(arg); scrollTo('writing');
        setTimeout(() => pushBot(`→ blog filtered by "${arg}".`), 80);
      }
      return true;
    }

    if (cmd === '/cv') {
      pushUser(raw);
      setTimeout(() => pushBot('CV: linkedin.com/in/gutembergsmendoza'), 80);
      return true;
    }

    return false;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const val = inputVal.trim();
    if (!val || status !== 'ready') return;
    setInputVal('');
    if (handleCommand(val)) return;
    const navDest = detectNavIntent(val);
    if (navDest) {
      scrollTo(navDest);
      pushUser(val);
      setTimeout(() => pushBot(getNavQuip(navDest, lang)), 80);
      return;
    }
    if (quota.quotaExhausted) {
      pushUser(val);
      pushBot(getExhaustedReply(lang, messages.length));
      scrollTo('contact');
      return;
    }
    saveMessage('user', val);
    sendMessage({ text: val });
  }

  function quickRun(cmd: string) {
    if (!handleCommand(cmd) && status === 'ready') sendMessage({ text: cmd });
  }

  const quick = lang === 'en' ? QUICK_EN : QUICK_ES;
  const providers = (['nvidia', 'openrouter', 'anthropic'] as const);

  return (
    <aside className={`chat ${className}`} aria-label="assistant">
      {onClose && <div className="chat-drag-handle" />}

      <div className="chat-head">
        <div className="chat-head-top">
          <span className="chat-head-label">// gmctl</span>
          <div className="chat-head-actions">
            {/* Model selector badge */}
            <button
              className={`model-badge${modelOpen ? ' open' : ''}`}
              onClick={() => setModelOpen(o => !o)}
              data-tip={i18n.modelTips.badge}
            >
              {selectedModel.label} ▾
            </button>

            {/* Model selector panel */}
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

            <button
              className={`chat-hist-btn${showHistory ? ' active' : ''}`}
              onClick={() => showHistory ? setShowHistory(false) : openHistory()}
              data-tip={i18n.modelTips.hist}
            >
              {i18n.chat.history}
            </button>
            <button
              className="chat-clear-btn"
              onClick={() => setMessages(makeInitialMsgs())}
              data-tip={i18n.modelTips.clear}
            >
              {i18n.chat.clear}
            </button>
          </div>
        </div>

        <div className="chat-head-meta">
          <div className="chat-usage" aria-live="polite">
            <span>{i18n.chat.quota.used}: {quota.tokensUsed24h}</span>
            <span>{i18n.chat.quota.remaining}: {quota.tokensRemaining24h}</span>
            {streamUsage.totalTokens > 0 && <span>msg: {streamUsage.totalTokens}</span>}
          </div>
          <div className="chat-head-status">
            <span className="chat-live">{i18n.chat.live}</span>
            {onClose && (
              <button className="chat-close-btn" onClick={onClose}>×</button>
            )}
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

      {/* History panel */}
      {showHistory ? (
        <div className="chat-history-panel">
          <div className="chat-history-header">
            <button
              className="chat-history-back"
              onClick={() => setShowHistory(false)}
              aria-label="close history"
            >
              {i18n.chat.historyBack}
            </button>
            <span>{i18n.chat.historyPanel}</span>
          </div>
          {histLoading && (
            <div className="chat-history-empty">{i18n.chat.historyLoading}</div>
          )}
          {!histLoading && sessions.length === 0 && (
            <div className="chat-history-empty">
              {i18n.chat.historyEmpty}
            </div>
          )}
          {!histLoading && sessions.map(s => (
            <button
              key={s.session_id}
              className="chat-history-item"
              onClick={() => resumeSession(s.session_id)}
            >
              <span className="chat-history-date">[{formatSessionDate(s.started_at, lang)}]</span>
              <span className="chat-history-preview">{s.preview || '(no messages)'}</span>
              <span className="chat-history-count">{s.count}msg</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="chat-body" ref={bodyRef}>
          {messages.map((m, idx) => {
            const isLast = idx === messages.length - 1;
            const raw = m.parts
              .filter(p => p.type === 'text')
              .map(p => (p as { type: 'text'; text: string }).text)
              .join('');
            // Strip leaked tool-call JSON some models emit inline as text
            const text = raw
              .replace(/\{[^{}]*"name"\s*:\s*"[^"]*"[^{}]*"parameters"\s*:[^}]*\}[^}]*\}/g, '')
              .replace(/\{"name"\s*:\s*"[^"]*"\s*,\s*"parameters"\s*:\s*\{[^}]*\}\}/g, '')
              .trim();
            if (!text) return null;
            const kind = m.role === 'user' ? 'user' : m.id === 'greet' ? 'sys' : 'bot';
            return (
              <div key={m.id} className={`msg ${kind}`}>
                {text}
                {isLast && status === 'streaming' && <span className="stream-cursor">▋</span>}
              </div>
            );
          })}
        </div>
      )}

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
          disabled={status === 'submitted' || status === 'streaming'}
          autoComplete="off"
          spellCheck={false}
        />
      </form>
    </aside>
  );
}
