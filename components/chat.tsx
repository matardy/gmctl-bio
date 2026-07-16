'use client';

import { CopilotChat, useAgent } from '@copilotkit/react-core/v2';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from '@/lib/data';
import { t } from '@/lib/i18n';
import { MODELS_BY_PROVIDER, PROVIDER_LABELS, type ModelConfig } from '@/lib/models';

interface ChatProps {
  lang: Lang;
  scrollTo: (id: string) => void;
  selectedModel: ModelConfig;
  onModelChange: (m: ModelConfig) => void;
  anonId: string;
  className?: string;
  onClose?: () => void;
}

interface QuotaState {
  tokensUsed24h: number;
  tokensLimit24h: number;
  tokensRemaining24h: number;
  quotaExhausted: boolean;
}

const SECTION_SET = new Set([
  'home', 'about', 'timeline', 'projects', 'services', 'writing', 'voices', 'contact',
]);

/**
 * Chat surface built on CopilotKit's prebuilt <CopilotChat>. The heavy
 * terminal chrome is intentionally toned down for a more subtle look; the
 * model picker and 24h quota indicator sit quietly around the conversation.
 * Navigation is driven by observing the agent's `navigate` tool calls.
 */
export function Chat({
  lang, scrollTo, selectedModel, onModelChange, anonId, className = '', onClose,
}: ChatProps) {
  const i18n = t(lang);
  const [modelOpen, setModelOpen] = useState(false);
  const [quota, setQuota] = useState<QuotaState>({
    tokensUsed24h: 0, tokensLimit24h: 0, tokensRemaining24h: 0, quotaExhausted: false,
  });
  const processedToolCalls = useRef(new Set<string>());
  const { agent } = useAgent();

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

  // React to the agent's navigate tool calls: scroll the site + refresh quota.
  useEffect(() => {
    const messages = agent?.messages ?? [];
    for (const msg of messages) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolCalls = (msg as any).toolCalls ?? (msg as any).tool_calls ?? [];
      for (const call of toolCalls) {
        const id = call.id ?? call.toolCallId;
        const name = call.function?.name ?? call.name;
        if (name !== 'navigate' || !id || processedToolCalls.current.has(id)) continue;
        processedToolCalls.current.add(id);
        let args = call.function?.arguments ?? call.args ?? {};
        if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
        if (args?.section && SECTION_SET.has(args.section)) scrollTo(args.section);
      }
    }
    if (anonId) refreshQuota(anonId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.messages, scrollTo, anonId]);

  const providers = (['nvidia', 'openrouter', 'anthropic'] as const);

  return (
    <aside className={`chat ${className}`} aria-label="assistant">
      {onClose && <div className="chat-drag-handle" />}

      <div className="chat-head">
        <div className="chat-head-top">
          <span className="chat-head-label">{lang === 'es' ? 'asistente' : 'assistant'}</span>
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
            {onClose && <button className="chat-close-btn" onClick={onClose}>×</button>}
          </div>
        </div>
        <div className="chat-head-meta">
          <span className="chat-usage" aria-live="polite">
            {i18n.chat.quota.remaining}: {quota.tokensRemaining24h}
          </span>
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

      <div className="chat-copilot">
        <CopilotChat
          labels={{
            chatInputPlaceholder: lang === 'es'
              ? 'Preguntá sobre Gutemberg…'
              : 'Ask about Gutemberg…',
          }}
        />
      </div>
    </aside>
  );
}
