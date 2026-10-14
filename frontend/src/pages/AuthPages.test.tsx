import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Register } from "./AuthPages";

const auth = vi.hoisted(() => ({ register: vi.fn() }));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ register: auth.register }),
}));

afterEach(cleanup);

describe("registration consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.register.mockResolvedValue("Confirmation email sent.");
  });

  it("requires explicit consent before registering", async () => {
    render(<MemoryRouter><Register /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/First name/), { target: { value: "Casey" } });
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: "Patient" } });
    fireEvent.change(screen.getByLabelText(/IIN/), { target: { value: "123456789012" } });
    fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: "casey@example.test" } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: "SecurePass123" } });

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You must agree to the terms and privacy policy");
    expect(auth.register).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("I agree to the terms and privacy policy"));
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(auth.register).toHaveBeenCalledTimes(1));
  });
});
