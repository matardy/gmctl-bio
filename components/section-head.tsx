export function SectionHead({ id, label, lang }: { id: string; label: string; lang: string }) {
  return (
    <div className="section-head">
      <span className="id">{id}</span>
      <span>// {label}</span>
      <span className="line" />
      <span>{lang.toUpperCase()}</span>
    </div>
  );
}
