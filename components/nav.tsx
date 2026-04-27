'use client';

import { COPY } from '@/lib/data';
import type { Lang } from '@/lib/data';

const SECTION_IDS = ['home', 'about', 'timeline', 'projects', 'services', 'writing', 'voices', 'contact'];

interface NavProps {
  lang: Lang;
  activeId: string;
  onNav: (id: string) => void;
  onLangToggle: () => void;
  onThemeToggle: () => void;
  theme: 'dark' | 'light';
}

export function Nav({ lang, activeId, onNav, onLangToggle, onThemeToggle, theme }: NavProps) {
  const nav = COPY[lang].nav;

  return (
    <nav className="nav" aria-label="sections">
      <div className="nav-brand">
        GUTEMBERG.<span style={{ color: 'var(--accent)' }}>M</span>
        <small>AI ENGINEER</small>
      </div>
      <ul>
        {nav.map(([id, label]) => {
          const target = SECTION_IDS[parseInt(id, 10)];
          return (
            <li key={id}>
              <a
                href={`#${target}`}
                className={activeId === target ? 'active' : ''}
                onClick={(e) => {
                  e.preventDefault();
                  onNav(target);
                  window.dispatchEvent(new CustomEvent('gmctl:nav', { detail: { dest: target } }));
                }}
              >
                <span className="num">{id}</span>{label}
              </a>
            </li>
          );
        })}
      </ul>
      <div className="nav-footer">
        <div><span className="dot" />{lang === 'en' ? 'available · 2026' : 'disponible · 2026'}</div>
        <div style={{ marginTop: 8 }}>QUITO · 24:00 UTC-5</div>
        <div style={{ marginTop: 16 }}>
          <a href="#" onClick={(e) => { e.preventDefault(); onLangToggle(); }}>
            {lang === 'en' ? '/ es' : '/ en'}
          </a>
          {' · '}
          <a href="#" onClick={(e) => { e.preventDefault(); onThemeToggle(); }}>
            {theme === 'dark' ? '/ light' : '/ dark'}
          </a>
        </div>
      </div>
    </nav>
  );
}
