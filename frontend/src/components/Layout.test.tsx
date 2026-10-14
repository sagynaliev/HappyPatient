import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Layout } from "./Layout";
import { Role, User } from "../lib/api";

const auth = vi.hoisted(() => ({
  user: null as User | null,
  logout: vi.fn(),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: auth.user, logout: auth.logout }),
}));

afterEach(cleanup);

function renderLayout(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Layout><p>Page content</p></Layout>
    </MemoryRouter>,
  );
}

function user(role: Role, firstName = "Alikhan", lastName = "Sagyn"): User {
  return {
    id: "user-1",
    email: "user@example.test",
    firstName,
    lastName,
    role,
  };
}

describe("shared header", () => {
  beforeEach(() => {
    auth.user = null;
    auth.logout.mockReset();
  });

  it("keeps avatar initials separate from the abbreviated profile name", () => {
    auth.user = user("DOCTOR");
    renderLayout("/doctor/schedule");

    expect(screen.getByText("AS", { selector: ".user-chip" })).toBeInTheDocument();
    expect(screen.getByText("Alikhan S.", { selector: ".fd-user-name" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Profile: Alikhan S." })).toBeInTheDocument();
    expect(screen.queryByText("ASAlikhan S.")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Dashboard" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Appointments" })).toHaveAttribute("href", "/doctor/appointments");
    expect(screen.getByRole("link", { name: "My Schedule" })).toHaveAttribute("href", "/doctor/schedule");
  });

  it("shows patient navigation without doctor-only links", () => {
    auth.user = user("PATIENT");
    renderLayout("/dashboard");

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "Appointments" })).toHaveAttribute("href", "/appointments");
    expect(screen.queryByRole("link", { name: "My Schedule" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Profile: Alikhan S." })).toBeInTheDocument();
  });

  it("provides one admin navigation set and shared profile/sign-out controls", () => {
    auth.user = user("ADMIN");
    renderLayout("/admin/dashboard");

    expect(screen.getAllByRole("link", { name: "Dashboard" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("href", "/admin/users");
    expect(screen.getByRole("link", { name: "Reports" })).toHaveAttribute("href", "/admin/reports");
    expect(screen.getByRole("link", { name: "Profile: Alikhan S." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(auth.logout).toHaveBeenCalledOnce();
  });

  it("does not render malformed names when authenticated profile fields are blank", () => {
    auth.user = user("PATIENT", "  ", "");
    renderLayout("/dashboard");

    expect(screen.getByText("Account", { selector: ".fd-user-name" })).toBeInTheDocument();
    expect(screen.queryByText(/undefined|null/i)).not.toBeInTheDocument();
  });
});
