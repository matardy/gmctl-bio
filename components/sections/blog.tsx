import { Reveal } from '@/components/reveal';
import { SectionHead } from '@/components/section-head';
import { POSTS } from '@/lib/data';
import type { Lang } from '@/lib/data';

const LABELS = {
  en: { title: 'Writing', sub: 'Notes on AI engineering, agents, and shipping.', none: 'no posts match.' },
  es: { title: 'Escritos', sub: 'Notas sobre ingeniería de IA, agentes y entrega.', none: 'no hay posts que coincidan.' },
};

export function BlogSection({ lang, filter }: { lang: Lang; filter: string }) {
  const c = LABELS[lang];
  const posts = filter
    ? POSTS.filter(p => p.tag.toLowerCase().includes(filter) || p.title.toLowerCase().includes(filter))
    : POSTS;

  return (
    <section id="writing" className="section">
      <SectionHead id="05" label={`${c.title} · ${c.sub}`} lang={lang} />
      <div className="blog">
        {posts.length === 0 && (
          <div style={{ padding: '40px 0', color: 'var(--fg-3)', fontSize: 12 }}>
            — {c.none} —
          </div>
        )}
        {posts.map((p, i) => (
          <Reveal key={i} className="post" as="a">
            <span className="date">{p.date}</span>
            <h3>{p.title}<span className="tag">/ {p.tag}</span></h3>
            <span className="read">{p.read} →</span>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
