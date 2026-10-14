import { Link, Outlet } from "react-router-dom";
import "../styles/adminPortal.css";

export default function AdminLayout() {
  return (
    <div className="admin-shell">
      <section className="admin-main">
        <Outlet />
      </section>

      <footer className="admin-footer">
        <Link to="/dashboard">Back to main dashboard</Link>
      </footer>
    </div>
  );
}
