import { SERVICES, type Lang } from '@/lib/data';

export function ServicesCard({ lang }: { lang: Lang }) {
  return (
    <div className="chat-card">
      <div className="chat-card-head">◆ {lang === 'en' ? 'services' : 'servicios'}</div>
      {SERVICES.map((s) => (
        <div key={s.num} className="chat-card-row">
          <div className="chat-card-title">{lang === 'en' ? s.titleEn : s.titleEs}</div>
          <div className="chat-card-price">
            <span className="chat-card-amt">{s.price}</span>{' '}
            <span className="chat-card-per">{lang === 'en' ? s.perEn : s.perEs}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
