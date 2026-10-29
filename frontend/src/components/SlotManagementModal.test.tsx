import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SlotManagementModal } from "./SlotManagementModal";
import type { ScheduleSlot } from "../lib/api";

afterEach(cleanup);
const base: ScheduleSlot = { id: "slot-1", startAt: "2099-05-11T09:00:00Z", endAt: "2099-05-11T09:30:00Z", status: "OCCUPIED" };
function show(slot: ScheduleSlot) {
  const onUpdate = vi.fn();
  const onConfirmRelease = vi.fn();
  render(<SlotManagementModal slot={slot} busy={false} loading={false} error="" message="" patientId="" visitPurpose="" confirmingRelease={false} onClose={vi.fn()} onPatientIdChange={vi.fn()} onVisitPurposeChange={vi.fn()} onUpdate={onUpdate} onConfirmRelease={onConfirmRelease} />);
  return { onUpdate, onConfirmRelease };
}
describe("manual slot availability", () => {
  it("hides manual availability for booked visits and retains the cancellation control", () => {
    const { onUpdate, onConfirmRelease } = show({ ...base, status: "BOOKED", patientId: "patient-1" });
    expect(screen.queryByRole("button", { name: "Mark as available" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Release appointment…" }));
    expect(onConfirmRelease).toHaveBeenCalledOnce();
    expect(onUpdate).not.toHaveBeenCalled();
  });
  it.each([
    { patientId: "patient-1", checkedInAt: "2099-05-11T08:55:00Z" },
    { patientId: "patient-1" },
    { patient: { id: "patient-1", firstName: "Casey", lastName: "Patient" } },
    { checkedInAt: "2099-05-11T08:55:00Z" },
  ])("hides availability and cancellation for occupied appointment data %j", fields => {
    show({ ...base, ...fields });
    expect(screen.queryByRole("button", { name: "Mark as available" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Release appointment…" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark as occupied" })).toBeNull();
  });
  it("allows a manual block without a patient or check-in to be made available", () => {
    const { onUpdate } = show({ ...base, patientId: null, patient: null, checkedInAt: null });
    fireEvent.click(screen.getByRole("button", { name: "Mark as available" }));
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith("FREE");
  });
});
