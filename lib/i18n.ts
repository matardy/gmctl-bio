import type { Lang } from './data';

export const UI = {
  en: {
    chat: {
      title: '// gmctl',
      history: 'History',
      clear: 'Clear',
      live: 'live',
      placeholder: 'ask anything · /help',
      historyPanel: 'past sessions',
      historyBack: '← back',
      historyEmpty: 'no past sessions found.',
      historyLoading: 'loading...',
      quota: {
        title: 'quota exhausted',
        body: 'you reached the 24-hour chat limit.',
        contact: 'contact',
        used: 'used',
        remaining: 'remaining',
      },
      moderation: {
        warn: 'I can help with Gutemberg, his work, projects, services, writing, or contact.',
        block: "That is outside this chat's scope. Try asking about Gutemberg instead.",
      },
    },
    nav: {
      langTip: 'Switch to Spanish',
      themeTipDark: 'Switch to light mode',
      themeTipLight: 'Switch to dark mode',
      available: 'available · 2026',
    },
    modelTips: {
      badge: 'Switch AI model',
      hist: 'View past conversations',
      clear: 'Clear current chat',
    },
  },
  es: {
    chat: {
      title: '// gmctl',
      history: 'Historial',
      clear: 'Limpiar',
      live: 'live',
      placeholder: 'pregunta lo que sea · /ayuda',
      historyPanel: 'sesiones anteriores',
      historyBack: '← volver',
      historyEmpty: 'no hay sesiones anteriores.',
      historyLoading: 'cargando...',
      quota: {
        title: 'cuota agotada',
        body: 'alcanzaste el limite de chat de las ultimas 24 horas.',
        contact: 'contacto',
        used: 'usados',
        remaining: 'restantes',
      },
      moderation: {
        warn: 'Puedo ayudarte con Gutemberg, su trabajo, proyectos, servicios, escritos o contacto.',
        block: 'Eso se sale del alcance de este chat. Prueba preguntando sobre Gutemberg.',
      },
    },
    nav: {
      langTip: 'Cambiar a inglés',
      themeTipDark: 'Cambiar a modo claro',
      themeTipLight: 'Cambiar a modo oscuro',
      available: 'disponible · 2026',
    },
    modelTips: {
      badge: 'Cambiar modelo de IA',
      hist: 'Ver conversaciones anteriores',
      clear: 'Limpiar el chat actual',
    },
  },
} as const;

export function t(lang: Lang) {
  return UI[lang];
}
