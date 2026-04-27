import Image from 'next/image';
import type { Lang } from '@/lib/data';

const CONTENT = {
  en: {
    hello: "Hello,",
    name: "I'm Gutemberg",
    sub: <>I help teams turn AI into <b>real products people use</b> — by pairing solid software engineering with the latest in AI.</>,
    keysL: <><b>Quito → Remote</b><br />Available · 2026</>,
    keysR: <>Press <b>/</b> to chat<br />Press <b>?</b> for help</>,
    stamp: 'GM // ENGINEER',
    down: 'SCROLL ↓',
  },
  es: {
    hello: "Hola,",
    name: 'Soy Gutemberg',
    sub: <>Ayudo a equipos a convertir la IA en <b>productos reales que la gente usa</b> — combinando ingeniería sólida con lo último en IA.</>,
    keysL: <><b>Quito → Remoto</b><br />Disponible · 2026</>,
    keysR: <>Pulsa <b>/</b> para chatear<br />Pulsa <b>?</b> para ayuda</>,
    stamp: 'GM // INGENIERO',
    down: 'BAJAR ↓',
  },
};

export function HeroSection({ lang }: { lang: Lang }) {
  const c = CONTENT[lang];
  const now = new Date();
  const ver = `v0.4.2 · ${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}`;

  return (
    <section id="home" className="section hero">
      <div className="hero-top">
        <span className="hero-emoji">=_=</span>
        <span>{ver}</span>
      </div>

      <div className="hero-mid">
        <div>
          <h1 className="hero-title">
            <span className="glitch" data-text={c.hello}>{c.hello}</span><br />
            <span className="glitch" data-text={c.name}>{c.name}</span>
            <span className="blink-cursor" />
          </h1>
          <p className="hero-sub">{c.sub}</p>
        </div>

        <div className="hero-portrait">
          <Image
            src="/portrait.jpg"
            alt="Gutemberg Mendoza"
            fill
            sizes="(max-width: 640px) 0px, (max-width: 1024px) 280px, 340px"
            style={{ objectFit: 'cover', filter: 'grayscale(1) contrast(1.05)' }}
            priority
          />
          <span className="corner tl" />
          <span className="corner tr" />
          <span className="corner bl" />
          <span className="corner br" />
          <span className="stamp">{c.stamp}</span>
        </div>
      </div>

      <div className="hero-bot">
        <div className="hero-keys" style={{ fontSize: 12, lineHeight: 1.8 }}>{c.keysL}</div>
        <a href="#about" className="hero-down">{c.down}</a>
        <div className="hero-keys" style={{ fontSize: 12, lineHeight: 1.8, textAlign: 'right' }}>{c.keysR}</div>
      </div>
    </section>
  );
}
