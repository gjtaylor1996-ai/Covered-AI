import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";

const SECTIONS = [
  {
    href: "/admin/dashboard",
    title: "Dashboard",
    description: "Open disputes, fill rate, GMV, platform revenue, verification backlog.",
  },
  {
    href: "/admin/verification",
    title: "Verification queue",
    description: "ID, right to work, and DBS checks awaiting a decision.",
  },
  {
    href: "/admin/disputes",
    title: "Disputes",
    description: "Pending and resolved disputes raised by workers and venues.",
  },
  {
    href: "/admin/signups",
    title: "Signups",
    description: "Every worker and venue signup — sortable, exportable to CSV.",
  },
];

export default function AdminHomePage() {
  return (
    <div className="page">
      <AppHeader links={[{ href: "/", label: "Home" }]} />
      <div className="content">
        <h1 style={{ fontSize: "22px", marginBottom: "18px" }}>Admin</h1>
        <div className="admin-hub-grid">
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} className="admin-hub-card">
              <div className="admin-hub-card-title">{s.title}</div>
              <p className="admin-hub-card-desc">{s.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
