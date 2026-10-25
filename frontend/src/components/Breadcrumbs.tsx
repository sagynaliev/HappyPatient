import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useBreadcrumbLabels } from "../lib/breadcrumbStore";
import "../styles/breadcrumbs.css";

type Crumb = { label: string; to?: string };

const ADMIN_SECTIONS: Record<string, string> = { dashboard: "Dashboard", users: "Users", doctors: "Doctors", appointments: "Appointments", reports: "Reports" };

export function buildCrumbs(pathname: string, labels: Record<string, string>, role?: string): Crumb[] {
  const home: Crumb = { label: "Home", to: "/" };
  const doctorLabel = labels.doctor ?? "Doctor";
  const findDoctor: Crumb = { label: "Find a doctor", to: "/search" };
  const parts = pathname.split("/").filter(Boolean);

  if (parts.length === 0) return [];
  if (pathname === "/search") return [home, { label: "Find a doctor" }];
  if (parts[0] === "doctors" && parts[1] && parts[2] === "schedule") {
    return [home, findDoctor, { label: doctorLabel, to: `/doctors/${parts[1]}` }, { label: "Book appointment" }];
  }
  if (parts[0] === "book" && parts[1]) return [home, findDoctor, { label: doctorLabel, to: `/doctors/${parts[1]}` }, { label: "Book appointment" }];
  if (parts[0] === "doctors" && parts[1]) return [home, findDoctor, { label: doctorLabel }];
  if (pathname === "/dashboard") return [home, { label: "Dashboard" }];
  if (pathname === "/appointments") return [home, { label: role === "PATIENT" ? "My appointments" : "Appointments" }];
  if (pathname === "/profile") return [home, { label: "Profile" }];
  if (parts[0] === "doctor") {
    const section = parts[1] === "schedule" ? "My schedule" : parts[1] === "appointments" ? "Appointments" : "Dashboard";
    return [home, { label: section }];
  }
  if (parts[0] === "front-desk") {
    return parts[1] === "walk-in" ? [home, { label: "Front desk", to: "/front-desk" }, { label: "Walk-in" }] : [home, { label: "Front desk" }];
  }
  if (parts[0] === "admin") {
    const section = ADMIN_SECTIONS[parts[1] ?? "dashboard"] ?? "Dashboard";
    return section === "Dashboard" ? [home, { label: "Admin" }] : [home, { label: "Admin", to: "/admin/dashboard" }, { label: section }];
  }
  if (pathname === "/login") return [home, { label: "Sign in" }];
  if (pathname === "/register") return [home, { label: "Create account" }];
  if (pathname === "/forgot-password" || pathname === "/reset-password") return [home, { label: "Sign in", to: "/login" }, { label: "Reset password" }];
  return [home];
}

/** "You are here" path: Home › Find a doctor › Dr. Aibek Akhmetov › Book appointment */
export function Breadcrumbs({ className = "" }: { className?: string }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const labels = useBreadcrumbLabels();
  const crumbs = buildCrumbs(pathname, labels, user?.role);
  if (crumbs.length < 2) return null;
  // Long paths collapse their middle into "…" so the trail never wraps.
  const visible = crumbs.length > 4 ? [crumbs[0], { label: "…" } as Crumb, ...crumbs.slice(-2)] : crumbs;
  return (
    <nav className={`hp-breadcrumbs ${className}`} aria-label="Breadcrumb">
      <ol>
        {visible.map((crumb, index) => {
          const last = index === visible.length - 1;
          return (
            <li key={`${crumb.label}-${index}`}>
              {last ? (
                <span aria-current="page">{crumb.label}</span>
              ) : crumb.to ? (
                <Link to={crumb.to}>{crumb.label}</Link>
              ) : (
                <span className="hp-crumb-plain">{crumb.label}</span>
              )}
              {!last && <svg className="hp-crumb-sep" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
