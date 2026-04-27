'use client';

import { useState, useEffect, useCallback } from 'react';
import { Boot } from '@/components/boot';
import { Nav } from '@/components/nav';
import { Chat } from '@/components/chat';
import { HeroSection } from '@/components/sections/hero';
import { AboutSection } from '@/components/sections/about';
import { TimelineSection } from '@/components/sections/timeline';
import { ProjectsSection } from '@/components/sections/projects';
import { ServicesSection } from '@/components/sections/services';
import { BlogSection } from '@/components/sections/blog';
import { VoicesSection } from '@/components/sections/voices';
import { ContactSection } from '@/components/sections/contact';
import { COPY } from '@/lib/data';
import type { Lang, TlFilter } from '@/lib/data';
import { DEFAULT_MODEL, type ModelConfig } from '@/lib/models';

const SECTION_IDS = ['home', 'about', 'timeline', 'projects', 'services', 'writing', 'voices', 'contact'];

const SECTION_LABEL: Record<string, string> = {
  home: '00 HOME', about: '01 ABOUT', timeline: '02 WORK',
  projects: '03 PROJECTS', services: '04 SERVICES',
  writing: '05 WRITING', voices: '06 VOICES', contact: '07 CONTACT',
};

const MOB_NAV = [
  { id: 'home',     icon: '■', label: 'home' },
  { id: 'timeline', icon: '▪', label: 'work' },
  { id: 'services', icon: '▫', label: 'svc' },
  { id: 'writing',  icon: '▤', label: 'blog' },
];

export default function Page() {
  const [lang, setLang] = useState<Lang>('en');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeId, setActiveId] = useState('home');
  const [tlFilter, setTlFilter] = useState<TlFilter>('all');
  const [blogFilter, setBlogFilter] = useState('');
  const [mobileChat, setMobileChat] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelConfig>(DEFAULT_MODEL);

  useEffect(() => {
    document.body.className = `theme-${theme}`;
  }, [theme]);

  useEffect(() => {
    const handler = () => {
      let cur = SECTION_IDS[0];
      for (const id of SECTION_IDS) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= window.innerHeight * 0.4) cur = id;
      }
      setActiveId(cur);
    };
    window.addEventListener('scroll', handler, { passive: true });
    handler();
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) window.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' });
  }, []);

  return (
    <>
      <Boot />

      {/* Mobile sticky top header */}
      <header className="mobile-header">
        <span className="mobile-header-brand">
          GUTEMBERG.<em>M</em>
        </span>
        <span className="mobile-header-section">{SECTION_LABEL[activeId] ?? '00 HOME'}</span>
      </header>

      <div className="app">
        <Nav
          lang={lang}
          activeId={activeId}
          onNav={scrollTo}
          onLangToggle={() => setLang(l => l === 'en' ? 'es' : 'en')}
          onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          theme={theme}
        />

        <main className="main">
          <HeroSection lang={lang} />
          <AboutSection lang={lang} />
          <TimelineSection lang={lang} filter={tlFilter} setFilter={setTlFilter} />
          <ProjectsSection lang={lang} />
          <ServicesSection lang={lang} />
          <BlogSection lang={lang} filter={blogFilter} />
          <VoicesSection lang={lang} />
          <ContactSection lang={lang} />

          <pre className="ascii-foot">{`▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓`}</pre>
          <div className="footer-end">
            <span>{COPY[lang].foot}</span>
            <span>EOF.</span>
          </div>
        </main>

        <Chat
          key={selectedModel.id}
          lang={lang}
          setLang={setLang}
          scrollTo={scrollTo}
          theme={theme}
          setTheme={setTheme}
          setTlFilter={setTlFilter}
          setBlogFilter={setBlogFilter}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
        />
      </div>

      {/* Mobile bottom nav */}
      <nav className="mobile-nav" aria-label="mobile navigation">
        <div className="mobile-nav-inner">
          {MOB_NAV.map(({ id, icon, label }) => (
            <a
              key={id}
              href={`#${id}`}
              className={activeId === id ? 'active' : ''}
              onClick={(e) => {
                e.preventDefault();
                scrollTo(id);
                window.dispatchEvent(new CustomEvent('gmctl:nav', { detail: { dest: id } }));
              }}
            >
              <span className="nav-icon">{icon}</span>
              {label}
            </a>
          ))}
          {/* Tweaks tab → opens chat */}
          <button
            className={`nav-tweaks${mobileChat ? ' active' : ''}`}
            onClick={() => setMobileChat(true)}
            aria-label="open chat"
          >
            <span className="nav-icon">≡</span>
            tweaks
          </button>
        </div>
      </nav>

      {/* Mobile chat FAB */}
      <button className="chat-fab" onClick={() => setMobileChat(true)} aria-label="open chat">
        ◆
      </button>

      {/* Tap-to-expand zone over the chat peek strip */}
      {!mobileChat && (
        <button className="chat-peek-trigger" onClick={() => setMobileChat(true)} aria-label="expand chat" />
      )}

      {/* Mobile chat overlay (only when fully open) */}
      <div className={`chat-overlay${mobileChat ? ' open' : ''}`} onClick={() => setMobileChat(false)} />
      <Chat
        key={`mobile-${selectedModel.id}`}
        lang={lang}
        setLang={setLang}
        scrollTo={scrollTo}
        theme={theme}
        setTheme={setTheme}
        setTlFilter={setTlFilter}
        setBlogFilter={setBlogFilter}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        className={`chat-mobile${mobileChat ? ' open' : ''}`}
        onClose={() => setMobileChat(false)}
      />
    </>
  );
}
