import { ReactNode, useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Role } from "../lib/api";
import { formatUserDisplayName, getUserInitials } from "../lib/userDisplay";
import { NotificationBell } from "./NotificationBell";
import { Icon, IconName } from "./Icons";
import { Breadcrumbs } from "./Breadcrumbs";
import { SidebarCard } from "./SidebarCard";
import "../styles/appShell.css";

const COMPACT_HEADER_QUERY = "(max-width: 1100px)";

function useCompactHeader() {
  const query = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(COMPACT_HEADER_QUERY).matches;
  const [compact, setCompact] = useState(query);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(COMPACT_HEADER_QUERY);
    const update = () => setCompact(media.matches);
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return compact;
}

type NavItem = { to: string; label: string; icon: IconName; end?: boolean };

const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  PATIENT: [
    { to: "/dashboard", label: "Dashboard", icon: "grid" },
    { to: "/search", label: "Find a Doctor", icon: "search" },
    { to: "/appointments", label: "Appointments", icon: "calendar" },
  ],
  DOCTOR: [
    { to: "/doctor/dashboard", label: "Dashboard", icon: "grid" },
    { to: "/doctor/appointments", label: "Appointments", icon: "calendar" },
    { to: "/doctor/schedule", label: "My Schedule", icon: "clock" },
  ],
  FRONT_DESK: [
    { to: "/front-desk", label: "Front desk", icon: "desk", end: true },
    { to: "/front-desk/walk-in", label: "Walk-in", icon: "user" },
    { to: "/search", label: "Find a Doctor", icon: "search" },
  ],
  ADMIN: [
    { to: "/admin/dashboard", label: "Dashboard", icon: "grid" },
    { to: "/admin/users", label: "Users", icon: "users" },
    { to: "/admin/doctors", label: "Doctors", icon: "stethoscope" },
    { to: "/admin/appointments", label: "Appointments", icon: "calendar" },
    { to: "/admin/reports", label: "Reports", icon: "chart" },
    { to: "/front-desk", label: "Front desk", icon: "desk", end: true },
    { to: "/front-desk/walk-in", label: "Walk-in", icon: "user" },
  ],
};

const AUTH_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password"];

function BrandMark() {
  return (
    <svg className="fd-heart-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <rect width="36" height="36" rx="11" fill="currentColor" />
      <path d="M18 27s-9-5.1-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.9-9 12-9 12Z" stroke="white" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10.5 18h4l2-3 2.8 6 2-3h4.2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const COLLAPSE_KEY = "hp_sidebar_collapsed";

function readCollapsed() {
  try { return window.localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; }
}

function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const close = () => setOpen(false);
  useEffect(close, [location.pathname]);
  if (!user) return null;
  const items = NAV_BY_ROLE[user.role] ?? [];
  const displayName = formatUserDisplayName(user.firstName, user.lastName);

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      try { window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch { /* the choice just is not remembered */ }
      return next;
    });
  }

  return (
    <div className={`hp-shell${open ? " is-nav-open" : ""}${collapsed ? " is-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className="hp-sidebar" id="primary-navigation" aria-label="Main navigation">
        <button className="hp-collapse" type="button" onClick={toggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-pressed={collapsed}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={collapsed ? "m9 6 6 6-6 6" : "m15 6-6 6 6 6"} /></svg>
        </button>
        <div className="hp-sidebar-top">
          <Link className="hp-brand" to="/" onClick={close} aria-label="HappyPatient home">
            <BrandMark />
            <span className="hp-hide-collapsed">Happy<b>Patient</b></span>
          </Link>
          <button className="hp-icon-button hp-sidebar-close" type="button" aria-label="Close navigation menu" onClick={close}><Icon name="close" /></button>
        </div>
        <div className="hp-nav-group">
          <p className="hp-nav-label hp-hide-collapsed">Menu</p>
          <nav className="hp-nav">
            <NavLink to="/" end onClick={close} className="hp-nav-link" data-tooltip="Home"><Icon name="home" /><span className="hp-hide-collapsed">Home</span></NavLink>
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} onClick={close} className="hp-nav-link" data-tooltip={item.label}>
                <Icon name={item.icon} />
                <span className="hp-hide-collapsed">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="hp-nav-group">
          <p className="hp-nav-label hp-hide-collapsed">Account</p>
          <NavLink className="fd-profile-link hp-profile" to="/profile" onClick={close} aria-label={`Profile: ${displayName}`} data-tooltip="Profile">
            <span className="user-chip" aria-hidden="true">{getUserInitials(user.firstName, user.lastName)}</span>
            <span className="hp-profile-text hp-hide-collapsed">
              <span className="fd-user-name">{displayName}</span>
              <small aria-hidden="true">View profile</small>
            </span>
          </NavLink>
          <button className="hp-signout" type="button" onClick={() => { logout(); navigate("/login"); }} data-tooltip="Sign out">
            <Icon name="logout" size={20} />
            <span className="hp-hide-collapsed">Sign out</span>
          </button>
        </div>
        <div className="hp-sidebar-foot">
          <SidebarCard role={user.role} collapsed={collapsed} />
        </div>
      </aside>
      <button className="hp-scrim" type="button" tabIndex={-1} aria-hidden="true" onClick={close} />

      <div className="hp-main">
        <header className="hp-topbar">
          <div className="hp-topbar-inner">
            <button className="hp-icon-button hp-menu-button" type="button" onClick={() => setOpen(true)} aria-label="Open navigation menu" aria-controls="primary-navigation" aria-expanded={open}><Icon name="menu" /></button>
            <Breadcrumbs />
            <div className="hp-top-actions">
              <NotificationBell />
            </div>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="hp-content">{children}</main>
      </div>
    </div>
  );
}

function PublicLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const isAuthRoute = AUTH_ROUTES.includes(location.pathname);
  const compactHeader = useCompactHeader();
  const showBell = Boolean(user);
  const items = user ? NAV_BY_ROLE[user.role] ?? [] : [];

  return (
    <div className="app-shell public-shell">
      <header className={`topbar topbar--shared${isAuthRoute ? " auth-topbar" : ""}`}>
        <div className="topbar-inner">
          <Link className="brand" to="/" onClick={close}>
            <BrandMark />
            <span>Happy <span>Patient</span></span>
          </Link>
          <a className="skip-link" href="#main-content">Skip to main content</a>
          {showBell && compactHeader && <NotificationBell />}
          <button className="menu-button" type="button" onClick={() => setOpen(!open)} aria-label={open ? "Close navigation menu" : "Open navigation menu"} aria-controls="primary-navigation" aria-expanded={open}>☰</button>

          <div className={`topbar-menu${open ? " open" : ""}`}>
            {user && (
              <nav id="primary-navigation" aria-label="Main navigation" className="nav">
                {items.map((item) => <NavLink key={item.to} to={item.to} onClick={close}>{item.label}</NavLink>)}
              </nav>
            )}

            <div className="topbar-actions">
              {user ? (
                <>
                  {showBell && !compactHeader && <NotificationBell />}
                  <NavLink className="fd-profile-link" to="/profile" onClick={close} aria-label={`Profile: ${formatUserDisplayName(user.firstName, user.lastName)}`}>
                    <span className="user-chip" aria-hidden="true">{getUserInitials(user.firstName, user.lastName)}</span>
                    <span className="fd-user-name">{formatUserDisplayName(user.firstName, user.lastName)}</span>
                  </NavLink>
                  <button className="button button-outline small" onClick={() => { logout(); navigate("/login"); close(); }}>Sign out</button>
                </>
              ) : isAuthRoute && location.pathname === "/register" ? (
                <Link className="button small" to="/login" state={location.state} onClick={close}>Sign in</Link>
              ) : isAuthRoute ? (
                <Link className="button small" to="/register" state={location.state} onClick={close}>Create account</Link>
              ) : (
                <>
                  <Link className="nav-signin" to="/login" onClick={close}>Sign in</Link>
                  <Link className="button small" to="/register" onClick={close}>Create account</Link>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {!isAuthRoute && location.pathname !== "/" && <div className="public-crumbs"><Breadcrumbs /></div>}
      <main id="main-content" tabIndex={-1}>{children}</main>

      {!isAuthRoute && (
        <footer className="hp-footer">
          <Link className="brand footer-brand" to="/"><BrandMark /><span>Happy <span>Patient</span></span></Link>
          <nav className="footer-links" aria-label="Footer">
            <Link to="/search">Find a doctor</Link>
            <a href="/#specialties">Specialties</a>
            {!user && <Link to="/register">Create account</Link>}
          </nav>
          <small>© 2026 HappyPatient · Almaty</small>
        </footer>
      )}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  // Signed-in people always get the same sidebar navigation, including on the home page.
  const usesAppShell = Boolean(user) && !AUTH_ROUTES.includes(location.pathname);
  return usesAppShell ? <AppShell>{children}</AppShell> : <PublicLayout>{children}</PublicLayout>;
}
