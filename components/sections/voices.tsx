import { Reveal } from '@/components/reveal';
import { SectionHead } from '@/components/section-head';
import { VOICES } from '@/lib/data';
import type { Lang } from '@/lib/data';

const TITLES = { en: 'Voices', es: 'Voces' };

export function VoicesSection({ lang }: { lang: Lang }) {
  return (
    <section id="voices" className="section">
      <SectionHead id="06" label={TITLES[lang]} lang={lang} />
      <div className="testimonials">
        {VOICES.map((v, i) => (
          <Reveal key={i} className="tm">
            <blockquote>{lang === 'en' ? v.quoteEn : v.quoteEs}</blockquote>
            <div className="who"><b>{v.name}</b> <span>· {v.role}</span></div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
