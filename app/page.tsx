'use client';

import { useState, useEffect, useCallback } from 'react';
import { CopilotKit } from '@copilotkit/react-core/v2';
import '@copilotkit/react-core/v2/styles.css';
import { Boot } from '@/components/boot';
import { Nav } from '@/components/nav';
import { Chat } from '@/components/chat';
import { Onboarding } from '@/components/onboarding';
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

const SECTION_LABELS = {
  en: {
    home: '00 HOME', about: '01 ABOUT', timeline: '02 WORK',
    projects: '03 PROJECTS', services: '04 SERVICES',
    writing: '05 WRITING', voices: '06 VOICES', contact: '07 CONTACT',
  },
  es: {
    home: '00 INICIO', about: '01 SOBRE MÍ', timeline: '02 TRAYECTORIA',
    projects: '03 PROYECTOS', services: '04 SERVICIOS',
    writing: '05 ESCRITOS', voices: '06 VOCES', contact: '07 CONTACTO',
  },
};

const MOB_NAV_LABELS = {
  en: [
    { id: 'home',     icon: '■', label: 'home' },
    { id: 'timeline', icon: '▪', label: 'work' },
    { id: 'services', icon: '▫', label: 'services' },
    { id: 'writing',  icon: '▤', label: 'blog' },
  ],
  es: [
    { id: 'home',     icon: '■', label: 'inicio' },
    { id: 'timeline', icon: '▪', label: 'trabajo' },
    { id: 'services', icon: '▫', label: 'servicios' },
    { id: 'writing',  icon: '▤', label: 'escritos' },
  ],
};

export default function Page() {
  const [lang, setLang] = useState<Lang>('en');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeId, setActiveId] = useState('home');
  const [tlFilter, setTlFilter] = useState<TlFilter>('all');
  const [blogFilter, setBlogFilter] = useState('');
  const [mobileChat, setMobileChat] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelConfig>(DEFAULT_MODEL);
  const [anonId, setAnonId] = useState('');
  const [sessionId, setSessionId] = useState('');

  useEffect(() => {
    const key = 'gmctl_anon_id';
    let id = localStorage.getItem(key);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id); }
    setAnonId(id);
    setSessionId((s) => s || crypto.randomUUID());
  }, []);

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
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      useSingleEndpoint
      properties={{
        provider: selectedModel.provider,
        model: selectedModel.id,
        anonId: anonId || undefined,
        sessionId: sessionId || undefined,
      }}
    >
      <Boot />
      <Onboarding lang={lang} />

      {/* Mobile sticky top header */}
      <header className="mobile-header">
        <span className="mobile-header-brand">
          GUTEMBERG.<em>M</em>
        </span>
        <span className="mobile-header-section">{SECTION_LABELS[lang][activeId as keyof typeof SECTION_LABELS.en] ?? SECTION_LABELS[lang].home}</span>
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
          primary
          lang={lang}
          setLang={setLang}
          scrollTo={scrollTo}
          setTheme={setTheme}
          setTlFilter={setTlFilter}
          setBlogFilter={setBlogFilter}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          anonId={anonId}
          sessionId={sessionId}
          setSessionId={setSessionId}
        />
      </div>

      {/* Mobile bottom nav */}
      <nav className="mobile-nav" aria-label="mobile navigation">
        <div className="mobile-nav-inner">
          {MOB_NAV_LABELS[lang].map(({ id, icon, label }) => (
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
        lang={lang}
        setLang={setLang}
        scrollTo={scrollTo}
        setTheme={setTheme}
        setTlFilter={setTlFilter}
        setBlogFilter={setBlogFilter}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        anonId={anonId}
        sessionId={sessionId}
        setSessionId={setSessionId}
        className={`chat-mobile${mobileChat ? ' open' : ''}`}
        onClose={() => setMobileChat(false)}
      />
    </CopilotKit>
  );
}
