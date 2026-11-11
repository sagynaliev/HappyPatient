import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WalkInSlotPicker from "./WalkInSlotPicker";
import { api, authApi } from "../lib/api";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, api: vi.fn(), authApi: { ...actual.authApi, frontDeskAvailability: vi.fn() } };
});

afterEach(cleanup);

const doctor = {
  id: "doc-1", name: "Dr. Ann Heart", specialty: "Cardiology", office: "Office 1", consultationFee: 10000,
  slots: [
    { id: "s1", startAt: "2099-05-10T09:00:00.000Z", endAt: "2099-05-10T09:30:00.000Z" },
    { id: "s2", startAt: "2099-05-10T09:30:00.000Z", endAt: "2099-05-10T10:00:00.000Z" },
  ],
};

describe("walk-in doctor and time picker", () => {
  beforeEach(() => {
    vi.mocked(api).mockResolvedValue({ categories: [{ name: "Cardiology" }, { name: "Dentistry" }] } as never);
    vi.mocked(authApi.frontDeskAvailability).mockResolvedValue({ date: "2099-05-10", doctors: [doctor] });
  });

  it("lists doctors with free times and selects a doctor and time in one tap", async () => {
    const onChange = vi.fn();
    render(<WalkInSlotPicker value={null} onChange={onChange} />);
    fireEvent.click(await screen.findByRole("button", { name: "Dr. Ann Heart, 14:30" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ doctorId: "doc-1", slotId: "s2", doctorName: "Dr. Ann Heart" }));
  });

  it("filters by one or more specialties picked from the checklist", async () => {
    vi.mocked(authApi.frontDeskAvailability).mockResolvedValue({ date: "2099-05-10", doctors: [doctor], specialtyCounts: { Cardiology: 1, Dentistry: 0 } });
    render(<WalkInSlotPicker value={null} onChange={vi.fn()} />);
    await screen.findByRole("button", { name: "Dr. Ann Heart, 14:30" });
    fireEvent.click(screen.getByRole("button", { name: "Specialties" }));
    fireEvent.click(await screen.findByLabelText("Dentistry"));
    await waitFor(() => expect(authApi.frontDeskAvailability).toHaveBeenLastCalledWith(expect.objectContaining({ categories: ["Dentistry"] })));
    fireEvent.click(screen.getByLabelText("Cardiology"));
    await waitFor(() => expect(authApi.frontDeskAvailability).toHaveBeenLastCalledWith(expect.objectContaining({ categories: ["Dentistry", "Cardiology"] })));
    expect(screen.getByRole("button", { name: "Remove Dentistry" })).toBeInTheDocument();
  });
});
