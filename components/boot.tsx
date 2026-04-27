'use client';

import { useEffect, useRef } from 'react';

const LINES = [
  '[ OK ] BIOS init  ......... gm.bios v0.4.2',
  '[ OK ] CPU         ........ 1x apple silicon',
  '[ OK ] Memory      ........ 16GB DDR4',
  '[ OK ] Loading kernel ..... gm-os/24.10',
  '[ OK ] Mount /home/gm  .... ok',
  '[ OK ] Boot agent: gmctl v1.0',
  '[ ok ] Welcome, operator.',
];

export function Boot() {
  const textRef = useRef<HTMLPreElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const bootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let i = 0;
    const el = textRef.current;
    const fill = fillRef.current;
    const boot = bootRef.current;
    if (!el || !fill || !boot) return;

    const tick = () => {
      if (i < LINES.length) {
        el.textContent += (i === 0 ? '' : '\n') + LINES[i];
        i++;
        fill.style.width = `${(i / LINES.length) * 100}%`;
        setTimeout(tick, 180);
      } else {
        setTimeout(() => {
          boot.classList.add('gone');
          setTimeout(() => { boot.style.display = 'none'; }, 500);
        }, 400);
      }
    };
    setTimeout(tick, 200);
  }, []);

  return (
    <div id="boot" className="boot" ref={bootRef}>
      <pre ref={textRef} />
      <div className="boot-bar">
        <div className="boot-bar-fill" ref={fillRef} />
      </div>
    </div>
  );
}
