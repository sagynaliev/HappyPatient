import { ReactNode, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatUserDisplayName, getUserInitials } from "../lib/userDisplay";

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const isDoctorSearch = location.pathname === "/search";
  const isFindDoctor = isDoctorSearch || /^\/doctors\/[^/]+$/.test(location.pathname);
  const isAppRoute = isFindDoctor
    || location.pathname === "/appointments"
    || /^\/doctors\/[^/]+\/schedule$/.test(location.pathname)
    || /^\/book\/[^/]+$/.test(location.pathname)
    || location.pathname === "/doctor/appointments"
    || location.pathname === "/doctor/dashboard"
    || location.pathname === "/doctor/schedule"
    || location.pathname.startsWith("/admin")
    || location.pathname === "/profile";
  const isAuthRoute = ["/login", "/register", "/forgot-password", "/reset-password"].includes(location.pathname);
  const isAdmin = user?.role === "ADMIN";

  return (
    <div className={`app-shell${isAppRoute ? " find-doctor-shell" : ""}${isDoctorSearch ? " find-directory-shell" : ""}`}>
      <header className={`topbar topbar--shared${isAuthRoute ? " auth-topbar" : ""}`}>
        <div className="topbar-inner">
          <Link className="brand" to="/" onClick={close}>
            <svg className="fd-heart-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none" aria-hidden="true">
              <rect width="36" height="36" rx="10" fill="currentColor" />
              <path d="M18 27s-9-5.1-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.9-9 12-9 12Z" stroke="white" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M10.5 18h4l2-3 2.8 6 2-3h4.2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Happy <span>Patient</span></span>
          </Link>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <button className="menu-button" type="button" onClick={() => setOpen(!open)} aria-label={open ? "Close navigation menu" : "Open navigation menu"} aria-controls="primary-navigation" aria-expanded={open}>☰</button>

        <div className={`topbar-menu${open ? " open" : ""}`}>
          <nav id="primary-navigation" aria-label="Main navigation" className="nav">
            <NavLink to="/" onClick={close}>Home</NavLink>
            <NavLink to="/search" onClick={close} className="find_doc">Find a Doctor</NavLink>
            {user?.role === "PATIENT" && <NavLink to="/dashboard" onClick={close}>Dashboard</NavLink>}
            {user?.role === "PATIENT" && <NavLink to="/appointments" onClick={close}>Appointments</NavLink>}
            {user?.role === "DOCTOR" && <NavLink to="/doctor/dashboard" onClick={close}>Dashboard</NavLink>}
            {user?.role === "DOCTOR" && <NavLink to="/doctor/appointments" onClick={close}>Appointments</NavLink>}
            {user?.role === "DOCTOR" && <NavLink to="/doctor/schedule" onClick={close}>My Schedule</NavLink>}
            {isAdmin && (
              <>
                <NavLink to="/admin/dashboard" onClick={close}>Dashboard</NavLink>
                <NavLink to="/admin/users" onClick={close}>Users</NavLink>
                <NavLink to="/admin/doctors" onClick={close}>Doctors</NavLink>
                <NavLink to="/admin/appointments" onClick={close}>Appointments</NavLink>
                <NavLink to="/admin/reports" onClick={close}>Reports</NavLink>
              </>
            )}
          </nav>

          <div className="topbar-actions">
            {user ? (
              <>
                <NavLink className="fd-profile-link" to="/profile" onClick={close} aria-label={`Profile: ${formatUserDisplayName(user.firstName, user.lastName)}`}>
                  <span className="user-chip" aria-hidden="true">{getUserInitials(user.firstName, user.lastName)}</span>
                  <span className="fd-user-name">{formatUserDisplayName(user.firstName, user.lastName)}</span>
                </NavLink>
                <button
                  className="button button-outline small"
                  onClick={() => {
                    logout();
                    navigate("/login");
                    close();
                  }}
                >
                  Sign out
                </button>
              </>
            ) : isAuthRoute && location.pathname === "/register" ? (
              <Link className="button small" to="/login" state={location.state} onClick={close}>Sign in</Link>
            ) : isAuthRoute ? (
              <Link className="button small" to="/register" state={location.state} onClick={close}>Create account</Link>
            ) : (
              <>
                <Link className="nav-signin" to="/login" onClick={close}>Sign in</Link>
                <Link className="button small" to="/register" onClick={close}>Book appointment <span>↗</span></Link>
              </>
            )}
          </div>
        </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>{children}</main>

      {!isAuthRoute && (
        <footer>
          <>
          <div>
            <Link className="brand footer-brand" to="/">
              <span className="brand-mark">+</span>
              <span>Happy<span>Patient</span></span>
            </Link>
            <p>Care that puts you first.</p>
          </div>
          <div className="footer-links">
            <a href="/#specialties">Specialties</a>
            <Link to="/search">Find a doctor</Link>
            <Link to="/register">Get started</Link>
          </div>
          <small>© 2026 HappyPatient</small>
          </>
        </footer>
      )}
    </div>
  );
}
