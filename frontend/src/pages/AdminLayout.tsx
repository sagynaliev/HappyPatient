import { Link, Outlet, useLocation } from "react-router-dom";
import "../styles/adminPortal.css";
import "../styles/adminOperations.css";

const tools = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/pricing", label: "Pricing" },
  { to: "/admin/statistics", label: "Statistics" },
  { to: "/admin/integrity", label: "Data quality" },
  { to: "/admin/reference-data", label: "Reference data" },
];

export default function AdminLayout() {
  const { pathname } = useLocation();
  const current = tools.find((tool) => pathname.startsWith(tool.to))?.to ?? (pathname.replace(/\/$/, "") === "/admin" ? "/admin/dashboard" : undefined);
  return (
    <div className="admin-shell">
      <section className="admin-main">
        <nav className="admin-tools" aria-label="Admin tools">
          {tools.map((tool) => <Link key={tool.to} to={tool.to} className={`admin-tool${current === tool.to ? " is-active" : ""}`} aria-current={current === tool.to ? "page" : undefined}>{tool.label}</Link>)}
        </nav>
        <Outlet />
      </section>
    </div>
  );
}
