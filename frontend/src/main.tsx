import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/RouteGuards";
import Home from "./pages/Home";
import { Login, Register, Forgot, Reset } from "./pages/AuthPages";
import Search from "./pages/Search";
import Dashboard from "./pages/Dashboard";
import PatientAppointments from "./pages/PatientAppointments";
import AdminDashboard from "./pages/AdminDashboard";
import AdminLayout from "./pages/AdminLayout";
import AdminUsersPage from "./pages/AdminUsersPage";
import AdminDoctorsPage from "./pages/AdminDoctorsPage";
import AdminAppointmentsPage from "./pages/AdminAppointmentsPage";
import AdminReportsPage from "./pages/AdminReportsPage";
import Schedule from "./pages/Schedule";
import DoctorProfilePage from "./pages/DoctorProfilePage";
import ProfilePage from "./pages/ProfilePage";
import DoctorAppointments from "./pages/DoctorAppointments";
import DoctorDashboard from "./pages/DoctorDashboard";
import FrontDeskPage from "./pages/FrontDeskPage";
import "./styles/global.css";
import "./styles/redesign.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Layout>
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
              </Route>
              <Route element={<ProtectedRoute roles={["ADMIN"]} />}>
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="dashboard" element={<AdminDashboard />} />
                <Route path="users" element={<AdminUsersPage />} />
                <Route path="doctors" element={<AdminDoctorsPage />} />
                <Route path="appointments" element={<AdminAppointmentsPage />} />
                <Route path="reports" element={<AdminReportsPage />} />
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
              <Route path="/doctor/appointments" element={<DoctorAppointments />} />
              <Route path="/doctor/schedule" element={<Schedule />} />
            </Route>
            <Route element={<ProtectedRoute roles={["FRONT_DESK", "ADMIN"]} />}>
              <Route path="/front-desk" element={<FrontDeskPage />} />
              <Route path="/front-desk/walk-in" element={<FrontDeskPage view="walk-in" />} />
            </Route>
          </Routes>
        </Layout>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
