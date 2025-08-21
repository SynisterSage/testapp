export default function NavCard({ title, subtitle, icon, onClick, href }) {
    const Tag = href ? "a" : "button";
    return (
      <Tag className="navcard" onClick={onClick} href={href}>
        <div className="navcard-icon" aria-hidden="true">{icon}</div>
        <div className="navcard-text">
          <div className="navcard-title">{title}</div>
          {subtitle ? <div className="navcard-sub">{subtitle}</div> : null}
        </div>
        <div className="navcard-chev" aria-hidden="true">›</div>
      </Tag>
    );
  }
  