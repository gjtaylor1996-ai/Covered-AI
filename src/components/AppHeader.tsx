import Link from "next/link";

export function AppHeader({ links }: { links: { href: string; label: string }[] }) {
  return (
    <header className="rail">
      <div className="rail-brand">
        <div className="brand-mark">Co</div>
        <span className="brand-name">Covered</span>
      </div>
      <nav className="rail-nav">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="rail-link">
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
