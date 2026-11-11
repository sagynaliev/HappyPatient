import "./styles/all";
import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { Toaster } from "./components/Toaster";
import { DemoTimeBadge } from "./components/DemoTimeBadge";
import { syncAppClock } from "./lib/appClock";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/RouteGuards";
const MedicalHistoryPage = lazy(() => import("./pages/MedicalHistoryPage"));
import Home from "./pages/Home";
import { Login, Register, Forgot, Reset } from "./pages/AuthPages";
import Search from "./pages/Search";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const PatientAppointments = lazy(() => import("./pages/PatientAppointments"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminLayout = lazy(() => import("./pages/AdminLayout"));
const AdminUsersPage = lazy(() => import("./pages/AdminUsersPage"));
const AdminDoctorsPage = lazy(() => import("./pages/AdminDoctorsPage"));
const AdminAppointmentsPage = lazy(() => import("./pages/AdminAppointmentsPage"));
const AdminOperationsPage = lazy(() => import("./pages/AdminOperationsPage"));
const AdminTimePage = lazy(() => import("./pages/AdminTimePage"));
const Schedule = lazy(() => import("./pages/Schedule"));
const DoctorProfilePage = lazy(() => import("./pages/DoctorProfilePage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const DoctorSchedulePage = lazy(() => import("./pages/DoctorSchedulePage"));
const DoctorVisitPage = lazy(() => import("./pages/DoctorVisitPage"));
const DoctorVisitsPage = lazy(() => import("./pages/DoctorVisitsPage"));
import { LegacyDoctorAppointments } from "./components/RouteGuards";
const DoctorDashboard = lazy(() => import("./pages/DoctorDashboard"));
const FrontDeskPage = lazy(() => import("./pages/FrontDeskPage"));
// After a new release an open tab still points at the old screen files; reload once to pick up the new ones.
window.addEventListener("vite:preloadError", () => {
  // At most one reload a minute, so a file that is really missing cannot loop the page.
  const last = Number(sessionStorage.getItem("hp_reloaded_for_update") ?? 0);
  if (performance.timeOrigin - last < 60_000) return;
  sessionStorage.setItem("hp_reloaded_for_update", String(performance.timeOrigin));
  window.location.reload();
});
// Read the demo clock before the first render so every screen starts with the same "now".
void syncAppClock().finally(() => createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Toaster />
        <DemoTimeBadge />
        <Layout>
          {/* Each role's screens load on demand, so the first visit downloads only the public pages. */}
          <Suspense fallback={<p className="skeleton" role="status">Loading…</p>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<Search />} />
            <Route path="/doctors/:doctorId" element={<DoctorProfilePage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<Forgot />} />
            <Route path="/reset-password" element={<Reset />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route element={<ProtectedRoute roles={["PATIENT"]} />}>
                <Route path="/appointments" element={<PatientAppointments />} />
                <Route path="/medical-history" element={<MedicalHistoryPage />} />
              </Route>
              <Route element={<ProtectedRoute roles={["ADMIN"]} />}>
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Navigate to="/admin/dashboard" replace />} />
                <Route path="dashboard" element={<AdminDashboard />} />
                <Route path="users" element={<AdminUsersPage />} />
                <Route path="doctors" element={<AdminDoctorsPage />} />
                <Route path="appointments" element={<AdminAppointmentsPage />} />
                <Route path="reports" element={<Navigate to="/admin/statistics" replace />} />
                <Route path="pricing" element={<AdminOperationsPage view="pricing" />} />
                <Route path="statistics" element={<AdminOperationsPage view="statistics" />} />
                <Route path="integrity" element={<AdminOperationsPage view="integrity" />} />
                <Route path="time" element={<AdminTimePage />} />
                <Route path="reference-data" element={<AdminOperationsPage view="reference" />} />
              </Route>
            </Route>
            </Route>
            <Route element={<ProtectedRoute roles={["PATIENT"]} />}>
              <Route path="/book/:doctorId" element={<Schedule />} />
              <Route
                path="/doctors/:doctorId/schedule"
                element={<Schedule />}
              />
            </Route>
            <Route element={<ProtectedRoute roles={["DOCTOR"]} />}>
              <Route path="/doctor/dashboard" element={<DoctorDashboard />} />
              <Route path="/doctor/schedule" element={<DoctorSchedulePage />} />
              <Route path="/doctor/visits" element={<DoctorVisitsPage />} />
              <Route path="/doctor/visits/:slotId" element={<DoctorVisitPage />} />
              <Route path="/doctor/appointments" element={<LegacyDoctorAppointments />} />
            </Route>
            <Route element={<ProtectedRoute roles={["FRONT_DESK", "ADMIN"]} />}>
              <Route path="/front-desk" element={<FrontDeskPage />} />
              <Route path="/front-desk/walk-in" element={<FrontDeskPage view="walk-in" />} />
            </Route>
          </Routes>
          </Suspense>
        </Layout>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
));
