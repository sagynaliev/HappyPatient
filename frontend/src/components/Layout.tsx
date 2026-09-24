import { ReactNode, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth, roleLabel } from "../context/AuthContext";

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const isAuthRoute = ["/login", "/register", "/forgot-password", "/reset-password"].includes(location.pathname);
  return <div className="app-shell">
    <header className={`topbar topbar-premium${isAuthRoute ? " auth-topbar" : ""}`}>
      <Link className="brand" to="/" onClick={close}><span className="brand-mark">+</span><span>Happy<span>Patient</span></span></Link>
      <button className="menu-button" onClick={() => setOpen(!open)} aria-label="Toggle menu" aria-expanded={open}>☰</button>
      <nav className={open ? "nav open" : "nav"}>
        <NavLink to="/search" onClick={close}>Find a Doctor</NavLink>
        {!isAuthRoute && user && <NavLink to="/dashboard" onClick={close}>My account</NavLink>}
        {!isAuthRoute && user ? <><span className="user-chip">{user.firstName} · {roleLabel(user.role)}</span><button className="button button-outline small" onClick={() => { logout(); navigate("/login"); close(); }}>Sign out</button></> : isAuthRoute && location.pathname === "/register" ? <Link className="button small" to="/login" onClick={close}>Sign in</Link> : isAuthRoute ? <Link className="button small" to="/register" onClick={close}>Create account</Link> : <><Link className="nav-signin" to="/login" onClick={close}>Sign in</Link><Link className="button small" to="/register" onClick={close}>Book appointment <span>↗</span></Link></>}
      </nav>
    </header>
    <main>{children}</main>
    {!isAuthRoute && <footer><div><Link className="brand footer-brand" to="/"><span className="brand-mark">+</span><span>Happy<span>Patient</span></span></Link><p>Care that puts you first.</p></div><div className="footer-links"><a href="/#specialties">Specialties</a><Link to="/search">Find a doctor</Link><Link to="/register">Get started</Link></div><small>© 2026 HappyPatient</small></footer>}
  </div>;
}
