import { Outlet } from "react-router-dom";
import "../styles/adminPortal.css";
import "../styles/adminOperations.css";

/** Frame for the admin screens. Every admin tool is in the left menu, so there is no second menu here. */
export default function AdminLayout() {
  return (
    <div className="admin-shell">
      <section className="admin-main">
        <Outlet />
      </section>
    </div>
  );
}
