import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gutemberg Mendoza — AI Engineer',
  description: 'AI Engineer building scalable AI products through solid software engineering and cutting-edge architecture. Based in Quito, Ecuador · Remote.',
  openGraph: {
    title: 'Gutemberg Mendoza — AI Engineer',
    description: 'AI Engineer building scalable AI products.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
