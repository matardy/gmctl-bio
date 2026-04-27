'use client';

import { useState } from 'react';
import { SectionHead } from '@/components/section-head';
import { CONTACTS } from '@/lib/data';
import type { Lang } from '@/lib/data';

const CONTENT = {
  en: {
    title: "Let's build something.",
    sub: 'Mentorship, consulting, or shipping an AI product together. Pick the channel that works for you.',
    newsTitle: 'Field notes',
    newsSub: "A short monthly email on AI engineering and what I'm shipping. No spam, easy to unsubscribe.",
    newsBtn: 'subscribe',
    placeholder: 'you@domain.tld',
  },
  es: {
    title: 'Construyamos algo.',
    sub: 'Mentoría, consultoría o lanzar un producto de IA juntos. Elige el canal que más te convenga.',
    newsTitle: 'Notas del campo',
    newsSub: 'Un email corto al mes sobre ingeniería de IA y lo que estoy construyendo. Sin spam, fácil de cancelar.',
    newsBtn: 'suscribir',
    placeholder: 'tu@dominio.com',
  },
};

export function ContactSection({ lang }: { lang: Lang }) {
  const c = CONTENT[lang];
  const [email, setEmail] = useState('');
  const [subbed, setSubbed] = useState(false);

  return (
    <section id="contact" className="section">
      <SectionHead id="07" label={c.title} lang={lang} />
      <div className="contact">
        <div>
          <h2><span className="glitch" data-text={c.title}>{c.title}</span></h2>
          <p>{c.sub}</p>
          <ul>
            {CONTACTS.map(([k, v, href]) => (
              <li key={k}>
                <span>{k}</span>
                <a href={href}>{v}</a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="newsletter">
            <h3>// {c.newsTitle}</h3>
            <p>{c.newsSub}</p>
            <form onSubmit={(e) => { e.preventDefault(); setSubbed(true); }}>
              <input
                type="email"
                placeholder={c.placeholder}
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
              <button type="submit">{subbed ? '✓' : c.newsBtn}</button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
