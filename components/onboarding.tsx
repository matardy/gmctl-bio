'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from '@/lib/data';

const TOUR_KEY = 'gmctl_toured';
const POPOVER_W = 300;

type Placement = 'left' | 'right' | 'bottom' | 'center';

interface Step {
  code: string;
  title: string;
  body: string;
  hint: string;
  target: string | null;
  placement: Placement;
}

const STEPS: Record<'en' | 'es', Step[]> = {
  en: [
    {
      code: '// AGENT ONLINE',
      title: 'Meet gmctl',
      body: 'This AI agent knows everything about Gutemberg. Ask anything in plain language — his work, projects, services, and how to reach him.',
      hint: 'Try: "What does Gutemberg do?" or "How can I hire him?"',
      target: '.chat:not(.chat-mobile)',
      placement: 'left',
    },
    {
      code: '// AI MODELS',
      title: 'Switch AI models',
      body: 'Click here to switch between AI providers — DeepSeek, Claude, GPT, and others. Each has its own speed and personality.',
      hint: 'Free models available. Paid models are marked with $.',
      target: '.model-badge',
      placement: 'bottom',
    },
    {
      code: '// CONVERSATION HISTORY',
      title: 'Your sessions are saved',
      body: 'Click here to browse and reload past conversations. Everything is stored anonymously — no account needed.',
      hint: 'Your ID lives in your browser only.',
      target: '.chat-hist-btn',
      placement: 'bottom',
    },
    {
      code: '// LANGUAGE & THEME',
      title: 'Language & appearance',
      body: 'Use these toggles in the left navigation panel to switch between English / Spanish and dark / light mode.',
      hint: 'Your preference stays active for the current session.',
      target: '.nav-footer',
      placement: 'right',
    },
    {
      code: '// AUTO-NAVIGATION',
      title: 'The site follows the conversation',
      body: 'When you ask about a topic, the page scrolls there automatically. No need to click — the agent navigates for you.',
      hint: 'Ask "show me his experience" → the timeline appears.',
      target: null,
      placement: 'center',
    },
  ],
  es: [
    {
      code: '// AGENTE EN LÍNEA',
      title: 'Conoce a gmctl',
      body: 'Este agente de IA sabe todo sobre Gutemberg. Pregunta lo que quieras — su trabajo, proyectos, servicios y cómo contactarlo.',
      hint: 'Prueba: "¿Qué hace Gutemberg?" o "¿Cómo lo contrato?"',
      target: '.chat:not(.chat-mobile)',
      placement: 'left',
    },
    {
      code: '// MODELOS DE IA',
      title: 'Cambia de modelo',
      body: 'Haz clic aquí para cambiar entre proveedores de IA — DeepSeek, Claude, GPT y otros. Cada uno tiene distinta velocidad y personalidad.',
      hint: 'Hay modelos gratuitos. Los de pago están marcados con $.',
      target: '.model-badge',
      placement: 'bottom',
    },
    {
      code: '// HISTORIAL DE CONVERSACIONES',
      title: 'Tus sesiones se guardan',
      body: 'Haz clic aquí para ver y retomar conversaciones anteriores. Todo se almacena de forma anónima en tu navegador.',
      hint: 'Sin cuenta. Tu ID vive solo en tu navegador.',
      target: '.chat-hist-btn',
      placement: 'bottom',
    },
    {
      code: '// IDIOMA Y TEMA',
      title: 'Idioma y apariencia',
      body: 'Usa estos controles en el panel de navegación izquierdo para cambiar entre inglés / español y modo oscuro / claro.',
      hint: 'Tu preferencia se mantiene durante la sesión actual.',
      target: '.nav-footer',
      placement: 'right',
    },
    {
      code: '// NAVEGACIÓN AUTOMÁTICA',
      title: 'El sitio sigue la conversación',
      body: 'Cuando preguntas sobre un tema, la página desplaza automáticamente hasta esa sección. Sin clic — el agente navega por ti.',
      hint: 'Pregunta "muéstrame su experiencia" → aparece el timeline.',
      target: null,
      placement: 'center',
    },
  ],
};

const UI = {
  en: { skip: 'skip', back: '← back', next: 'next →', done: 'start chatting →', label: 'guided tour' },
  es: { skip: 'saltar', back: '← atrás', next: 'siguiente →', done: 'empezar a chatear →', label: 'tour guiado' },
};

interface Rect { top: number; left: number; width: number; height: number; }

function popoverStyle(rect: Rect | null, placement: Placement): React.CSSProperties {
  if (!rect || placement === 'center') {
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }
  const gap = 18;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  switch (placement) {
    case 'left': {
      const top = Math.max(16, Math.min(rect.top + rect.height / 2 - 130, vh - 300));
      const left = Math.max(16, rect.left - POPOVER_W - gap);
      return { top, left };
    }
    case 'right': {
      const top = Math.max(16, Math.min(rect.top + rect.height / 2 - 130, vh - 300));
      const left = Math.min(rect.left + rect.width + gap, vw - POPOVER_W - 16);
      return { top, left };
    }
    case 'bottom': {
      const top = Math.min(rect.top + rect.height + gap, vh - 260);
      const left = Math.max(16, Math.min(rect.left + rect.width / 2 - POPOVER_W / 2, vw - POPOVER_W - 16));
      return { top, left };
    }
  }
}

export function Onboarding({ lang }: { lang: Lang }) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(TOUR_KEY)) return;
    const timer = setTimeout(() => setVisible(true), 2900);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!visible) { document.body.removeAttribute('data-tour-step'); return; }
    document.body.setAttribute('data-tour-step', String(step));
    return () => document.body.removeAttribute('data-tour-step');
  }, [visible, step]);

  const measureTarget = useCallback(() => {
    const current = STEPS[lang][step];
    if (!current.target) { setRect(null); return; }
    const el = document.querySelector(current.target) as HTMLElement | null;
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step, lang]);

  useEffect(() => {
    if (!visible) return;
    measureTarget();
    window.addEventListener('resize', measureTarget);
    return () => window.removeEventListener('resize', measureTarget);
  }, [visible, measureTarget]);

  function dismiss() {
    localStorage.setItem(TOUR_KEY, '1');
    setVisible(false);
  }

  function goNext() { setStep(s => s + 1); }
  function goBack() { setStep(s => s - 1); }

  if (!visible) return null;

  const steps = STEPS[lang];
  const ui = UI[lang];
  const current = steps[step];
  const isLast = step === steps.length - 1;
  const pad = 8;

  return (
    <>
      <div className="tour-backdrop" onClick={dismiss} />

      {rect && (
        <div
          ref={spotlightRef}
          className="tour-spotlight"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
          }}
        />
      )}

      <div className="tour-popover" style={popoverStyle(rect, current.placement)}>
        <div className="tour-pop-head">
          <span className="tour-code">{current.code}</span>
          <span className="tour-counter">{step + 1} / {steps.length}</span>
          <button className="tour-close" onClick={dismiss}>×</button>
        </div>

        <div className="tour-pop-body">
          <h3 className="tour-title">{current.title}</h3>
          <p className="tour-text">{current.body}</p>
          <p className="tour-hint"><span className="tour-arrow">hint →</span> {current.hint}</p>
        </div>

        <div className="tour-pop-foot">
          <div className="tour-dots">
            {steps.map((_, i) => (
              <button
                key={i}
                className={`tour-dot${i === step ? ' on' : ''}`}
                onClick={() => setStep(i)}
                aria-label={`step ${i + 1}`}
              />
            ))}
          </div>
          <div className="tour-nav">
            {step === 0
              ? <button className="tour-btn ghost" onClick={dismiss}>{ui.skip}</button>
              : <button className="tour-btn ghost" onClick={goBack}>{ui.back}</button>}
            {isLast
              ? <button className="tour-btn primary" onClick={dismiss}>{ui.done}</button>
              : <button className="tour-btn primary" onClick={goNext}>{ui.next}</button>}
          </div>
        </div>
      </div>
    </>
  );
}
