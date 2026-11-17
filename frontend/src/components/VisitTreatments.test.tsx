import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddTreatmentDialog, TreatmentTimelineBlock, useVisitTreatments } from "./VisitTreatments";
import { authApi, TreatmentChoice } from "../lib/api";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const ecg: TreatmentChoice = { key: "ecg-1", code: "ECG-1", name: "Electrocardiogram", amountKzt: 5000, ruleId: "r1", scope: "specialty" };
const dressing: TreatmentChoice = { key: "dressing", code: null, name: "Wound dressing", amountKzt: 2000, ruleId: "r2", scope: "general" };
const knee = { id: "t0", code: null, name: "Knee ultrasound", amountKzt: 8500, createdAt: "2026-11-14T10:00:00Z" };

/** The visit page wiring in miniature: the hook, the timeline block and the Add treatment dialog. */
function Harness({ slotId = "visit-1" }: { slotId?: string }) {
  const treatments = useVisitTreatments(slotId, true);
  const [open, setOpen] = useState(false);
  return <>
    {treatments.editable && <button type="button" onClick={() => setOpen(true)}>Add treatment</button>}
    <TreatmentTimelineBlock items={treatments.added} editable={treatments.editable} busy={treatments.busy} onRemove={(item) => void treatments.remove(item)} />
    {open && <AddTreatmentDialog available={treatments.available} specialty="Cardiology" busy={treatments.busy} onAdd={treatments.add} onClose={() => setOpen(false)} />}
  </>;
}

describe("treatments in the visit timeline", () => {
  it("adds treatments from a searchable list with quantities, groups the doctor's specialty first, and removes them", async () => {
    vi.spyOn(authApi, "visitTreatments").mockResolvedValue({ editable: true, available: [ecg, dressing], added: [knee] });
    let next = 1;
    vi.spyOn(authApi, "addVisitTreatment").mockImplementation(async (_slot, key) => ({ treatment: { id: `t${next++}`, code: null, name: key === "ecg-1" ? "Electrocardiogram" : "Wound dressing", amountKzt: key === "ecg-1" ? 5000 : 2000, createdAt: "2026-11-14T10:05:00Z" } }));
    vi.spyOn(authApi, "removeVisitTreatment").mockResolvedValue(undefined);
    render(<Harness />);
    const block = await screen.findByRole("article", { name: "Treatments in this visit" });
    expect(within(block).getByText("8,500 KZT", { selector: "strong" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add treatment" }));
    const dialog = screen.getByRole("dialog", { name: "Add treatment" });
    const groups = within(dialog).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(groups).toEqual(["For Cardiology", "For every doctor"]);
    fireEvent.change(within(dialog).getByRole("searchbox", { name: "Search treatments" }), { target: { value: "wound" } });
    expect(within(dialog).queryByText("Electrocardiogram")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add Wound dressing" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "One more Wound dressing" }));
    expect(within(dialog).getByText("2 selected · 4,000 KZT")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(authApi.addVisitTreatment).toHaveBeenCalledTimes(2));
    expect(authApi.addVisitTreatment).toHaveBeenCalledWith("visit-1", "dressing");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await within(block).findByText("12,500 KZT", { selector: "strong" })).toBeTruthy();

    fireEvent.click(within(block).getByRole("button", { name: "Remove Knee ultrasound" }));
    await waitFor(() => expect(authApi.removeVisitTreatment).toHaveBeenCalledWith("visit-1", "t0"));
    expect(await within(block).findByText("4,000 KZT", { selector: "strong" })).toBeTruthy();
  });

  it("is read-only after the editing window and shows nothing when no treatment was recorded", async () => {
    vi.spyOn(authApi, "visitTreatments").mockResolvedValueOnce({ editable: false, available: [], added: [knee] });
    render(<Harness />);
    expect(await screen.findByText("Knee ultrasound")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Remove|Add treatment/ })).toBeNull();
    cleanup();
    vi.spyOn(authApi, "visitTreatments").mockResolvedValueOnce({ editable: false, available: [], added: [] });
    const { container } = render(<Harness slotId="visit-2" />);
    await waitFor(() => expect(authApi.visitTreatments).toHaveBeenCalledWith("visit-2"));
    expect(container.textContent).toBe("");
  });
});
