import type { Lang } from '@/lib/data';

const EXHAUSTED_REPLIES: Record<Lang, string[]> = {
  en: [
    'nice try. the quota is already dead.',
    'this is now theater. prerecorded replies only.',
    'no budget, no inference. try contact.',
    'the model has been temporarily laid off for overspending.',
  ],
  es: [
    'bonita tentativa. la cuota ya murio hace rato.',
    'esto ahora es teatro. mensajes pregrabados unicamente.',
    'sin presupuesto no hay inferencia. prueba contacto.',
    'el modelo fue despedido temporalmente por exceso de consumo.',
  ],
};

export function getExhaustedReply(lang: Lang, seed: number) {
  const pool = EXHAUSTED_REPLIES[lang];
  return pool[seed % pool.length];
}
