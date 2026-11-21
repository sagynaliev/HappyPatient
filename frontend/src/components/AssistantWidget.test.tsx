import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantWidget } from "./AssistantWidget";
import { assistantApi, authApi } from "../lib/api";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, assistantApi: { chat: vi.fn() }, authApi: { ...actual.authApi, bookSlot: vi.fn() } };
});

const card = (slotId: string, startAt: string) => ({ slotId, doctorId: "doctor-1", doctorName: "Dr. Arman Bekov", specialty: "Pediatrics", office: "Room 4", startAt, endAt: startAt, channel: "online" as const, visitKind: "first" as const, priceKzt: 12000, visitPurpose: "Cough" });

afterEach(cleanup);
beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(assistantApi.chat).mockReset();
  vi.mocked(authApi.bookSlot).mockReset();
});

describe("patient assistant", () => {
  it("opens with a greeting and answers a suggested question", async () => {
    vi.mocked(assistantApi.chat).mockResolvedValue({ reply: "Check-in opens 30 minutes before.", cards: [] });
    render(<AssistantWidget firstName="Aigerim" />);
    fireEvent.click(screen.getByRole("button", { name: "Open assistant" }));
    expect(screen.getByRole("heading", { name: /Hello Aigerim/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "How does check-in work?" }));
    expect(await screen.findByText("Check-in opens 30 minutes before.")).toBeInTheDocument();
    expect(assistantApi.chat).toHaveBeenCalledWith([{ role: "user", content: "How does check-in work?" }]);
    expect(screen.getByText("AI can make mistakes. It doesn't give medical advice.")).toBeInTheDocument();
  });

  it("books only when the patient confirms the chosen time", async () => {
    vi.mocked(assistantApi.chat).mockResolvedValue({ reply: "Two times are free.", cards: [card("slot-1", "2099-03-02T04:00:00Z"), card("slot-2", "2099-03-02T05:00:00Z")] });
    vi.mocked(authApi.bookSlot).mockResolvedValue({ slot: { id: "slot-2", startAt: "", endAt: "", status: "BOOKED" }, reference: "HP-SLOT2" });
    render(<AssistantWidget firstName="Aigerim" />);
    fireEvent.click(screen.getByRole("button", { name: "Open assistant" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "Book Dr. Bekov online" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Dr. Arman Bekov")).toBeInTheDocument();
    expect(screen.getByText("12 000 ₸")).toBeInTheDocument();
    expect(authApi.bookSlot).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: "10:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));

    await waitFor(() => expect(authApi.bookSlot).toHaveBeenCalledWith("doctor-1", "slot-2", "Cough", "online"));
    expect(await screen.findByText(/You'll find it in My appointments/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm booking" })).not.toBeInTheDocument();

    // Moving to another page remounts the widget; the booked card stays booked.
    cleanup();
    render(<AssistantWidget firstName="Aigerim" />);
    fireEvent.click(screen.getByRole("button", { name: "Open assistant" }));
    expect(screen.getAllByText(/HP-SLOT2/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Confirm booking" })).not.toBeInTheDocument();
  });

  it("shows the server's message when the assistant fails", async () => {
    const { ApiError } = await import("../lib/api");
    vi.mocked(assistantApi.chat).mockRejectedValue(new ApiError(429, "You've reached today's assistant limit. Try again tomorrow."));
    render(<AssistantWidget firstName="Aigerim" />);
    fireEvent.click(screen.getByRole("button", { name: "Open assistant" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "Hi" } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Message" }), { key: "Enter" });
    expect(await screen.findByText(/today's assistant limit/)).toBeInTheDocument();
  });

  it("resends the same conversation from Try again after a busy error", async () => {
    const { ApiError } = await import("../lib/api");
    vi.mocked(assistantApi.chat).mockRejectedValueOnce(new ApiError(429, "The assistant is busy right now. Try again in a minute.")).mockResolvedValueOnce({ reply: "Here you go.", cards: [] });
    render(<AssistantWidget firstName="Aigerim" />);
    fireEvent.click(screen.getByRole("button", { name: "Open assistant" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "dermatology" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Here you go.")).toBeInTheDocument();
    expect(assistantApi.chat).toHaveBeenLastCalledWith([{ role: "user", content: "dermatology" }]);
    expect(screen.queryByText(/is busy right now/)).toBeNull();
    expect(screen.getAllByText("dermatology")).toHaveLength(1);
  });
});
