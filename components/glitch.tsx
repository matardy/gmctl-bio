'use client';

export function Glitch({ children }: { children: string }) {
  return (
    <span className="glitch" data-text={children}>
      {children}
    </span>
  );
}
