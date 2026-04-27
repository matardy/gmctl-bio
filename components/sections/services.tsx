import { Reveal } from '@/components/reveal';
import { SectionHead } from '@/components/section-head';
import { SERVICES } from '@/lib/data';
import type { Lang } from '@/lib/data';

const LABELS = {
  en: { title: 'Services', sub: 'Bookable, async-first.', book: 'book' },
  es: { title: 'Servicios', sub: 'Reservables, asíncrono primero.', book: 'reservar' },
};

export function ServicesSection({ lang }: { lang: Lang }) {
  const c = LABELS[lang];
  return (
    <section id="services" className="section">
      <SectionHead id="04" label={`${c.title} · ${c.sub}`} lang={lang} />
      <div className="services">
        {SERVICES.map(s => (
          <Reveal key={s.num} className="svc">
            <span className="num">SVC / {s.num}</span>
            <h3>{lang === 'en' ? s.titleEn : s.titleEs}</h3>
            <p>{lang === 'en' ? s.descEn : s.descEs}</p>
            <ul>
              {(lang === 'en' ? s.bulletsEn : s.bulletsEs).map(b => <li key={b}>{b}</li>)}
            </ul>
            <div className="price">
              <b>{s.price}</b>
              <small>{lang === 'en' ? s.perEn : s.perEs}</small>
            </div>
            <a className="btn" href="#contact">{c.book}</a>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
