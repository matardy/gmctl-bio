import { Reveal } from '@/components/reveal';
import { SectionHead } from '@/components/section-head';
import { PROJECTS } from '@/lib/data';
import type { Lang } from '@/lib/data';

const TITLES = { en: 'Selected Work', es: 'Trabajo destacado' };

export function ProjectsSection({ lang }: { lang: Lang }) {
  return (
    <section id="projects" className="section">
      <SectionHead id="03" label={TITLES[lang]} lang={lang} />
      <div className="projects">
        {PROJECTS.map((p, i) => (
          <Reveal key={i} className="project">
            <span className="tag">{p.tag}</span>
            <h3>{p.title}</h3>
            <p>{lang === 'en' ? p.descEn : p.descEs}</p>
            <pre className="ascii">{p.ascii}</pre>
            <div className="stack">
              {p.stack.map(s => <span key={s}>{s}</span>)}
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
