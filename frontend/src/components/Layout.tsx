import { ReactNode, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const isAuthRoute = ["/login", "/register", "/forgot-password", "/reset-password"].includes(location.pathname);
  const dashboardPath = user?.role === "ADMIN" ? "/admin" : "/dashboard";
  const getInitials = (firstName?: string, lastName?: string): string => {
    const firstInitial = firstName?.charAt(0) || '';
    const lastInitial = lastName?.charAt(0) || '';
  
    return `${firstInitial}${lastInitial}`.toUpperCase();
  };

  return (
    <div className="app-shell">
      <header className={`topbar topbar-premium${isAuthRoute ? " auth-topbar" : ""}`}>
        <Link className="brand" to="/" onClick={close}>
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="4" fill="#0F766E"/>
        <rect x="3" y="19" width="6" height="26" rx="3" transform="rotate(-90 3 19)" fill="white"/>
        <rect x="12" y="2" width="8" height="27" rx="4" fill="#0F766E"/>
        <rect x="13" y="3" width="6" height="26" rx="3" fill="white"/>
        </svg>
        <span>Happy<span>Patient</span></span>
        </Link>

        <button className="menu-button" onClick={() => setOpen(!open)} aria-label="Toggle menu" aria-expanded={open}>☰</button>

        <nav className={open ? "nav open" : "nav"}>
          <NavLink to="/search" onClick={close} className = "find_doc">Find a Doctor</NavLink>
          {!isAuthRoute && user && <NavLink to={dashboardPath} onClick={close}>{user.role === "ADMIN" ? "Admin dashboard" : <span className="user-chip">
              {getInitials(user.firstName, user.lastName)}
              </span>}</NavLink>}

          {!isAuthRoute && user ? (
            <>
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
        </nav>
      </header>

      <main>{children}</main>

      {!isAuthRoute && (
        <footer>
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
        </footer>
      )}
    </div>
  );
}
