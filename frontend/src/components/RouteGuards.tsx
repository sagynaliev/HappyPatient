import { Navigate, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Role } from "../lib/api";
export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="loading">Loading your account…</div>;
  if (!user)
    return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (roles && !roles.includes(user.role))
    return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

/** Appointments merged into the schedule; old links (emails, notifications) open the visit or the schedule. */
export function LegacyDoctorAppointments() {
  const [params] = useSearchParams();
  const slotId = params.get("appointmentId") ?? params.get("slotId");
  return <Navigate to={slotId ? `/doctor/visits/${encodeURIComponent(slotId)}` : "/doctor/schedule"} replace />;
}
