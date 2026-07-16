'use client';

import { COPY } from '@/lib/data';
import type { Lang } from '@/lib/data';
import { t } from '@/lib/i18n';

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
  const i18n = t(lang);

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
        <div><span className="dot" />{i18n.nav.available}</div>
        <div style={{ marginTop: 8 }}>QUITO · 24:00 UTC-5</div>
        <div style={{ marginTop: 16 }}>
          <a
            href="#"
            className="has-tip"
            data-tip={i18n.nav.langTip}
            onClick={(e) => { e.preventDefault(); onLangToggle(); }}
          >
            {lang === 'en' ? '/ es' : '/ en'}
          </a>
          {' · '}
          <a
            href="#"
            className="has-tip"
            data-tip={theme === 'dark' ? i18n.nav.themeTipDark : i18n.nav.themeTipLight}
            onClick={(e) => { e.preventDefault(); onThemeToggle(); }}
          >
            {theme === 'dark' ? '/ light' : '/ dark'}
          </a>
        </div>
      </div>
    </nav>
  );
}
