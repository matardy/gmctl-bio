import { Fragment } from 'react';
import { SectionHead } from '@/components/section-head';
import type { Lang } from '@/lib/data';

const CONTENT = {
  en: {
    title: 'About',
    head: 'Engineering meets AI — in plain terms.',
    p1: <>I&apos;m <strong>Gutemberg S. Mendoza</strong>, an AI engineer with 5+ years building software that uses AI to solve real business problems. I work on the kind of systems that handle thousands of users, day in and day out, without breaking.</>,
    p2: <>The best AI products happen when <strong>good engineering meets smart use of AI</strong>. My job is making that work in practice — so the tech stays out of the way and the product just feels useful.</>,
    meta: [
      ['Based', 'Quito, Ecuador · Remote'],
      ['Tools', 'Python, TypeScript, modern AI frameworks'],
      ['Focus', 'AI agents · Smart search · Reliability'],
      ['Education', 'EPN — Computer Science & Physics'],
      ['Today', 'Senior AI Engineer @ Clarika'],
    ],
  },
  es: {
    title: 'Sobre mí',
    head: 'Ingeniería y IA — explicado simple.',
    p1: <>Soy <strong>Gutemberg S. Mendoza</strong>, ingeniero de IA con más de 5 años construyendo software que usa IA para resolver problemas reales de negocio. Trabajo en el tipo de sistemas que atienden a miles de usuarios todos los días, sin fallar.</>,
    p2: <>Los mejores productos de IA aparecen cuando <strong>la buena ingeniería se junta con un uso inteligente de la IA</strong>. Mi trabajo es lograr que eso funcione en la práctica — que la tecnología no estorbe y el producto se sienta útil.</>,
    meta: [
      ['Base', 'Quito, Ecuador · Remoto'],
      ['Herramientas', 'Python, TypeScript, frameworks modernos de IA'],
      ['Foco', 'Agentes · Búsqueda inteligente · Confiabilidad'],
      ['Estudios', 'EPN — Computación y Física'],
      ['Hoy', 'Senior AI Engineer @ Clarika'],
    ],
  },
};

export function AboutSection({ lang }: { lang: Lang }) {
  const c = CONTENT[lang];
  return (
    <section id="about" className="section">
      <SectionHead id="01" label={c.title} lang={lang} />
      <div className="about">
        <div>
          <h2><span className="glitch" data-text={c.head}>{c.head}</span></h2>
          <p>{c.p1}</p>
          <p>{c.p2}</p>
        </div>
        <div>
          <dl className="about-meta">
            {c.meta.map(([k, v]) => (
              <Fragment key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </Fragment>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
