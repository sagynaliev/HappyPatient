import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import VisitTreatments from "./VisitTreatments";
import { authApi } from "../lib/api";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const ecg = { key: "ecg-1", code: "ECG-1", name: "Electrocardiogram", amountKzt: 5000, ruleId: "r1" };

describe("treatments on the doctor's visit page", () => {
  it("adds and removes treatments and keeps the total", async () => {
    vi.spyOn(authApi, "visitTreatments").mockResolvedValue({ editable: true, available: [ecg], added: [{ id: "t0", code: null, name: "Knee ultrasound", amountKzt: 8500, createdAt: "2026-11-14T10:00:00Z" }] });
    vi.spyOn(authApi, "addVisitTreatment").mockResolvedValue({ treatment: { id: "t1", code: "ECG-1", name: "Electrocardiogram", amountKzt: 5000, createdAt: "2026-11-14T10:05:00Z" } });
    vi.spyOn(authApi, "removeVisitTreatment").mockResolvedValue(undefined);
    render(<VisitTreatments slotId="visit-1" />);
    const panel = (await screen.findByRole("heading", { name: "Treatments" })).closest("section")!;
    expect(within(panel).getByText("8,500 KZT", { selector: "strong" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Treatment"), { target: { value: "ecg-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Add treatment" }));
    await waitFor(() => expect(authApi.addVisitTreatment).toHaveBeenCalledWith("visit-1", "ecg-1"));
    expect(await within(panel).findByText("13,500 KZT", { selector: "strong" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove Knee ultrasound" }));
    await waitFor(() => expect(authApi.removeVisitTreatment).toHaveBeenCalledWith("visit-1", "t0"));
    expect(await within(panel).findByText("5,000 KZT", { selector: "strong" })).toBeTruthy();
  });

  it("is read-only after the editing window and hidden when nothing was recorded", async () => {
    vi.spyOn(authApi, "visitTreatments").mockResolvedValueOnce({ editable: false, available: [], added: [{ id: "t0", code: null, name: "Knee ultrasound", amountKzt: 8500, createdAt: "2026-11-14T10:00:00Z" }] });
    render(<VisitTreatments slotId="visit-1" />);
    expect(await screen.findByText("Recorded during this visit.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(screen.queryByLabelText("Treatment")).toBeNull();
    cleanup();
    vi.spyOn(authApi, "visitTreatments").mockResolvedValueOnce({ editable: false, available: [], added: [] });
    const { container } = render(<VisitTreatments slotId="visit-2" />);
    await waitFor(() => expect(authApi.visitTreatments).toHaveBeenCalledWith("visit-2"));
    expect(container.textContent).toBe("");
  });
});
