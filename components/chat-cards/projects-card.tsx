import { PROJECTS, type Lang } from '@/lib/data';

export function ProjectsCard({ lang }: { lang: Lang }) {
  return (
    <div className="chat-card">
      <div className="chat-card-head">◆ {lang === 'en' ? 'projects' : 'proyectos'}</div>
      {PROJECTS.slice(0, 3).map((p) => (
        <div key={p.title} className="chat-card-row">
          <div className="chat-card-tag">{p.tag}</div>
          <div className="chat-card-title">{p.title}</div>
          <div className="chat-card-stack">{p.stack.join(' · ')}</div>
        </div>
      ))}
    </div>
  );
}
