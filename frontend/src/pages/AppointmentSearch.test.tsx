import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import PatientAppointments from "./PatientAppointments";
import AdminAppointmentsPage from "./AdminAppointmentsPage";
import DoctorVisitsPage from "./DoctorVisitsPage";
import { authApi, PatientAppointment } from "../lib/api";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, api: vi.fn(() => Promise.resolve({ consultationKzt: 0, totalKzt: 0, parking: null })), authApi: { ...actual.authApi, myAppointments: vi.fn(), adminAppointments: vi.fn(), doctorProfile: vi.fn(), getSchedule: vi.fn() } };
});
afterEach(cleanup);

const visit = (id: string, startAt: string, doctor: string, specialty: string, visitPurpose: string): PatientAppointment => ({ id, startAt, endAt: new Date(Date.parse(startAt) + 18e5).toISOString(), status: "BOOKED", visitPurpose, reference: `HP-${id.toUpperCase()}`, doctor: { name: doctor, specialty, office: null, consultationFee: 10000 } });

describe("patient appointment search and sort", () => {
  it("filters upcoming visits by text and sorts by doctor", async () => {
    vi.mocked(authApi.myAppointments).mockResolvedValue({ appointments: [visit("a", "2099-05-12T05:00:00Z", "Dr. Zara Late", "Cardiology", "Heart"), visit("b", "2099-05-10T05:00:00Z", "Dr. Adam Early", "Dentistry", "Teeth")], cancelled: [] } as never);
    render(<MemoryRouter initialEntries={["/appointments"]}><Routes><Route path="/appointments" element={<PatientAppointments />} /></Routes></MemoryRouter>);
    const names = () => [...document.querySelectorAll(".patient-appointments-grid h2")].map((heading) => heading.textContent);
    await screen.findAllByText("Dr. Zara Late");
    expect(names().indexOf("Dr. Adam Early")).toBeLessThan(names().indexOf("Dr. Zara Late"));
    fireEvent.change(screen.getByRole("combobox", { name: "Sort appointments" }), { target: { value: "latest" } });
    expect(names().indexOf("Dr. Zara Late")).toBeLessThan(names().indexOf("Dr. Adam Early"));
    fireEvent.change(screen.getByPlaceholderText(/Search doctor/), { target: { value: "cardio" } });
    expect(names()).toEqual(["Dr. Zara Late"]);
    expect(screen.getByText("1 of 2")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Search doctor/), { target: { value: "nothing" } });
    expect(screen.getByText("No matching appointments")).toBeTruthy();
  });
});

describe("admin appointment search and sort", () => {
  it("searches, filters by status and sorts by column", async () => {
    vi.mocked(authApi.adminAppointments).mockResolvedValue({ appointments: [
      { id: "1", patient: "Bob Brown", doctor: "Dr. A", specialty: "Cardiology", date: "2099-05-10T05:00:00Z", status: "Booked", purpose: "x" },
      { id: "2", patient: "Ann Adams", doctor: "Dr. B", specialty: "Dentistry", date: "2099-05-11T05:00:00Z", status: "Checked in", purpose: "y" },
    ] } as never);
    render(<AdminAppointmentsPage />);
    await screen.findByText("Bob Brown");
    const rows = () => within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row").map((row) => row.textContent ?? "");
    fireEvent.click(screen.getByRole("button", { name: /Patient/ }));
    expect(rows()[0]).toContain("Ann Adams");
    fireEvent.click(screen.getByRole("button", { name: /Patient/ }));
    expect(rows()[0]).toContain("Bob Brown");
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "Checked in" } });
    expect(rows()).toHaveLength(1);
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "all" } });
    fireEvent.change(screen.getByPlaceholderText(/Search patient/), { target: { value: "dentistry" } });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toContain("Ann Adams");
  });
});

describe("doctor visits by date", () => {
  it("shows a chosen date and sorts by time", async () => {
    vi.mocked(authApi.doctorProfile).mockResolvedValue({ doctor: { id: "d1", office: null, category: { name: "Pediatrics" } } } as never);
    vi.mocked(authApi.getSchedule).mockResolvedValue({ doctor: { id: "d1", office: null, category: { name: "Pediatrics" } }, slots: [
      { id: "s1", startAt: "2099-05-10T04:00:00Z", endAt: "2099-05-10T04:30:00Z", status: "BOOKED", patient: { id: "p1", firstName: "Early", lastName: "Patient" } },
      { id: "s2", startAt: "2099-05-10T07:00:00Z", endAt: "2099-05-10T07:30:00Z", status: "BOOKED", patient: { id: "p2", firstName: "Late", lastName: "Patient" } },
      { id: "s3", startAt: "2099-06-01T07:00:00Z", endAt: "2099-06-01T07:30:00Z", status: "BOOKED", patient: { id: "p3", firstName: "Other", lastName: "Day" } },
    ] } as never);
    render(<MemoryRouter><DoctorVisitsPage /></MemoryRouter>);
    await screen.findByRole("button", { name: /Upcoming/ });
    fireEvent.change(screen.getByLabelText("Visits on a date"), { target: { value: "2099-05-10" } });
    await waitFor(() => expect(screen.queryByText("Other Day")).toBeNull());
    const order = () => screen.getAllByText(/Patient$/).map((node) => node.textContent);
    expect(order()).toEqual(["Early Patient", "Late Patient"]);
    fireEvent.change(screen.getByRole("combobox", { name: "Sort by date" }), { target: { value: "desc" } });
    expect(order()).toEqual(["Late Patient", "Early Patient"]);
  });
});
