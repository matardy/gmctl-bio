'use client';

import { Reveal } from '@/components/reveal';
import { SectionHead } from '@/components/section-head';
import { EXPERIENCE, EDUCATION } from '@/lib/data';
import type { Lang, TlFilter } from '@/lib/data';

const LABELS = {
  en: { title: 'Timeline', all: 'all', work: 'work', edu: 'education', eduTitle: 'Education' },
  es: { title: 'Trayectoria', all: 'todo', work: 'trabajo', edu: 'estudios', eduTitle: 'Formación' },
};

interface Props { lang: Lang; filter: TlFilter; setFilter: (f: TlFilter) => void; }

export function TimelineSection({ lang, filter, setFilter }: Props) {
  const c = LABELS[lang];
  const items = filter === 'edu' ? [] : filter === 'all' || filter === 'work'
    ? EXPERIENCE
    : EXPERIENCE.filter(e => e.org.toLowerCase().includes(filter) || e.id.includes(filter));
  const showEdu = filter === 'all' || filter === 'edu';

  return (
    <section id="timeline" className="section">
      <SectionHead id="02" label={c.title} lang={lang} />
      <div className="tl-filter">
        <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>{c.all}</button>
        <button className={filter === 'work' ? 'on' : ''} onClick={() => setFilter('work')}>{c.work}</button>
        <button className={filter === 'edu' ? 'on' : ''} onClick={() => setFilter('edu')}>{c.edu}</button>
      </div>

      <div className="timeline">
        {items.map((e, i) => (
          <Reveal key={e.id} className={`tl-item ${i % 2 === 0 ? 'left' : 'right'}${e.cur ? ' cur' : ''}`}>
            <div className="meta">
              <span className="yr">{e.yr}</span>
              <span>{lang === 'en' ? e.locEn : e.locEs}</span>
              <span className="dur">{lang === 'en' ? e.durEn : e.durEs}</span>
            </div>
            <div className="dot" />
            <div className="body">
              <h3 className="role">{e.role}</h3>
              <p className="org">{e.org}</p>
              <p className="desc">{lang === 'en' ? e.descEn : e.descEs}</p>
              <div className="tags">
                {e.tags.map(t => <span key={t}>{t}</span>)}
              </div>
            </div>
          </Reveal>
        ))}

        {showEdu && (
          <div className="tl-edu">
            <h3>{c.eduTitle}</h3>
            {EDUCATION.map((e, i) => (
              <Reveal key={e.id} className={`tl-item ${i % 2 === 0 ? 'left' : 'right'}`}>
                <div className="meta">
                  <span className="yr">{e.yr}</span>
                </div>
                <div className="dot" />
                <div className="body">
                  <h3 className="role">{e.role}</h3>
                  <p className="org">{e.org}</p>
                  <p className="desc">{lang === 'en' ? e.descEn : e.descEs}</p>
                  <div className="tags">
                    {e.tags.map(t => <span key={t}>{t}</span>)}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
