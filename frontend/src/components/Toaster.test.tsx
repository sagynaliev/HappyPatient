import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "./Toaster";
import { toast } from "../lib/toast";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("toasts", () => {
  it("announces success politely, errors as alerts, and can be dismissed", () => {
    render(<Toaster />);
    act(() => { toast.success("Appointment confirmed", "Dr. Sam Doctor · 16:30"); toast.error("Check-in failed"); });
    expect(screen.getByRole("status")).toHaveTextContent("Appointment confirmed");
    expect(screen.getByRole("alert")).toHaveTextContent("Check-in failed");
    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss notification" })[0]);
    expect(screen.queryByText("Appointment confirmed")).toBeNull();
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" })); });
  });

  it("closes itself after the timeout", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => { toast.info("Cancellation undone"); });
    expect(screen.getByText("Cancellation undone")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(5100); });
    expect(screen.queryByText("Cancellation undone")).toBeNull();
  });
});
