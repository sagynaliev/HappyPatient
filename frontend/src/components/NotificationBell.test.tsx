import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { NotificationBell } from "./NotificationBell";
import { authApi } from "../lib/api";
import { notifyNotificationsChanged } from "../lib/notificationEvents";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: { role: "PATIENT" } }) }));

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, authApi: { ...actual.authApi, notifications: vi.fn(), markNotificationsRead: vi.fn() } };
});

afterEach(cleanup);

const now = new Date().toISOString();
const items = [
  { id: "n2", type: "CHECKED_IN", channel: "in-app", status: "RECORDED", subject: "Visit check-in confirmed", message: "Visit check-in confirmed. HP-1 with Dr. Sam Doctor.", createdAt: now, readAt: null },
  { id: "n1", slotId: "slot-1", type: "BOOKED", channel: "in-app", status: "RECORDED", subject: "Appointment booking confirmed", message: "Appointment booking confirmed. HP-1 with Dr. Sam Doctor.", createdAt: now, readAt: now },
  { id: "n3", slotId: "slot-2", type: "CANCELLED", channel: "in-app", status: "RECORDED", subject: "Appointment cancelled", message: "Appointment cancelled by the clinic.", createdAt: now, readAt: now },
];

describe("header notification bell (US25, US27)", () => {
  beforeEach(() => {
    vi.mocked(authApi.notifications).mockReset();
    vi.mocked(authApi.notifications).mockResolvedValue({ notifications: items, unreadCount: 1 });
    vi.mocked(authApi.markNotificationsRead).mockResolvedValue({ updated: 1 });
  });

  it("shows the unread count on the bell", async () => {
    render(<MemoryRouter><NotificationBell /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: "Notifications, 1 unread" })).toBeInTheDocument();
  });

  it("opens the list and marks notifications as read on request", async () => {
    render(<MemoryRouter><NotificationBell /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    expect(await screen.findByRole("dialog", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByText("Visit check-in confirmed")).toBeInTheDocument();
    expect(screen.getByText("Appointment booking confirmed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Appointment booking confirmed.*Open appointment/ })).toHaveAttribute("href", "/appointments?appointmentId=slot-1");
    expect(screen.getByRole("link", { name: /Appointment cancelled.*Open appointment/ })).toHaveClass("notification-item-link");
    expect(authApi.markNotificationsRead).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    await waitFor(() => expect(authApi.markNotificationsRead).toHaveBeenCalledOnce());
    expect(await screen.findByRole("button", { name: "Notifications" })).toBeInTheDocument();
  });

  it("closes with Escape", async () => {
    render(<MemoryRouter><NotificationBell /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /Notifications/ }));
    await screen.findByRole("dialog", { name: "Notifications" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument();
  });

  it("refreshes after a booking, cancellation or check-in action", async () => {
    render(<MemoryRouter><NotificationBell /></MemoryRouter>);
    await screen.findByRole("button", { name: "Notifications, 1 unread" });
    vi.mocked(authApi.notifications).mockResolvedValue({ notifications: items, unreadCount: 2 });
    await act(async () => { notifyNotificationsChanged(); });
    expect(await screen.findByRole("button", { name: "Notifications, 2 unread" })).toBeInTheDocument();
  });
});
