import { CONTACTS, type Lang } from '@/lib/data';

export function ContactCard({ lang }: { lang: Lang }) {
  const shown = CONTACTS.filter(([key]) => key === 'email' || key === 'linkedin' || key === 'github');
  return (
    <div className="chat-card">
      <div className="chat-card-head">◆ {lang === 'en' ? 'contact' : 'contacto'}</div>
      {shown.map(([key, label, href]) => (
        <a key={key} className="chat-card-contact" href={href} target="_blank" rel="noopener noreferrer">
          <span className="chat-card-contact-key">{key}</span>
          <span className="chat-card-contact-val">{label}</span>
        </a>
      ))}
    </div>
  );
}
