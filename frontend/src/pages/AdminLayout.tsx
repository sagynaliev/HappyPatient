import { Link, Outlet } from "react-router-dom";
import "../styles/adminPortal.css";

export default function AdminLayout() {
  return (
    <div className="admin-shell">
      <section className="admin-main">
        <nav aria-label="Admin tools"><Link to="/admin">Dashboard</Link> · <Link to="/admin/pricing">Pricing</Link> · <Link to="/admin/statistics">Statistics</Link> · <Link to="/admin/integrity">Data quality</Link> · <Link to="/admin/reference-data">Reference data</Link></nav><Outlet />
      </section>

      <footer className="admin-footer">
        <Link to="/dashboard">Back to main dashboard</Link>
      </footer>
    </div>
  );
}
