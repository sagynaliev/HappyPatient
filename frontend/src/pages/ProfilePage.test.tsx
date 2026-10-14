import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "./ProfilePage";
import { authApi, ProfileUser } from "../lib/api";

const session = vi.hoisted(() => ({
  profile: {
    id: "patient-1", firstName: "Amina", lastName: "Nurpeisova", email: "amina@example.test", phone: "+7 700 000 00 42",
    role: "PATIENT" as const, maskedIin: "••••••••••42", createdAt: "2026-10-14T00:00:00.000Z",
  },
  refreshProfile: vi.fn(),
  updateProfile: vi.fn(),
  role: "PATIENT" as "PATIENT" | "DOCTOR",
}));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { ...session.profile, role: session.role }, refreshProfile: session.refreshProfile, updateProfile: session.updateProfile }),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("patient profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.role = "PATIENT";
    session.refreshProfile.mockImplementation(async () => ({ ...session.profile, role: session.role } as ProfileUser));
    session.updateProfile.mockImplementation(async (input) => ({ ...session.profile, ...input } as ProfileUser));
  });

  it("loads account data and keeps the IIN masked and fields read-only", async () => {
    render(<MemoryRouter><ProfilePage /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Amina Nurpeisova" })).toBeTruthy();
    expect((screen.getByLabelText("IIN (Individual Identification Number)") as HTMLInputElement).value).toBe("••••••••••42");
    expect((screen.getByLabelText("Email Address") as HTMLInputElement).hasAttribute("readonly")).toBe(true);
    expect(screen.getByText("Member since 14 October 2026")).toBeTruthy();
  });

  it("saves editable contact details through the authenticated profile action", async () => {
    render(<MemoryRouter><ProfilePage /></MemoryRouter>);
    await screen.findByRole("heading", { name: "Amina Nurpeisova" });
    fireEvent.click(screen.getByRole("button", { name: "Edit personal profile" }));
    fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Amira" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(session.updateProfile).toHaveBeenCalledWith({ firstName: "Amira", lastName: "Nurpeisova", phone: "+7 700 000 00 42" }));
    expect((await screen.findByRole("status")).textContent).toContain("Profile updated.");
  });

  it("loads real doctor details and persists structured clinic location", async () => {
    session.role = "DOCTOR";
    vi.spyOn(authApi, "doctorProfile").mockResolvedValue({
      doctor: { id: "doctor-1", office: null, city: "Almaty", clinicName: "Central Clinic", streetAddress: "18 Abay Avenue", officeNumber: "Office 101", consultationFee: 12000, category: { name: "Cardiology" } },
    });
    vi.spyOn(authApi, "updateLocation").mockResolvedValue({
      doctor: { id: "doctor-1", office: null, city: "Almaty", clinicName: "West Clinic", streetAddress: "1 Dostyk Avenue", officeNumber: "Room 4", consultationFee: 12000, category: { name: "Cardiology" } },
    });
    render(<MemoryRouter><ProfilePage /></MemoryRouter>);
    expect(await screen.findByDisplayValue("Central Clinic")).toBeTruthy();
    expect(screen.getByDisplayValue("Cardiology")).toBeTruthy();
    expect(screen.getByDisplayValue("12,000 KZT")).toBeTruthy();
    expect(screen.queryByDisplayValue("Dentist")).toBeNull();

    fireEvent.change(screen.getByLabelText("Clinic name"), { target: { value: "West Clinic" } });
    fireEvent.change(screen.getByLabelText("Street address"), { target: { value: "1 Dostyk Avenue" } });
    fireEvent.change(screen.getByLabelText("Cabinet / office number"), { target: { value: "Room 4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save clinic location" }));
    await waitFor(() => expect(authApi.updateLocation).toHaveBeenCalledWith({
      city: "Almaty",
      clinicName: "West Clinic",
      streetAddress: "1 Dostyk Avenue",
      officeNumber: "Room 4",
    }));
    expect(await screen.findByDisplayValue("West Clinic")).toBeTruthy();
  });
});
