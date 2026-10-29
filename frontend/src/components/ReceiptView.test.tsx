import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReceiptView } from "./ReceiptView";
import { downloadReceiptPdf, receiptFileName } from "../lib/receiptPdf";
import { Receipt } from "../lib/api";

vi.mock("../lib/receiptPdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/receiptPdf")>();
  return { ...actual, downloadReceiptPdf: vi.fn().mockResolvedValue(undefined) };
});

afterEach(cleanup);

const receipt: Receipt = {
  id: "r1", reference: "HP-ABC12345", status: "OCCUPIED", patientDisplayName: "Casey Patient", patientMaskedIin: "••••••••9012",
  doctor: "Dr. Sam Doctor", specialty: "Cardiology", consultationFee: 20000, office: "Office 101",
  startAt: "2026-10-22T08:30:00.000Z", endAt: "2026-10-22T09:00:00.000Z", checkedInAt: "2026-10-22T08:20:00.000Z", checkedInBy: "Self check-in",
};

describe("receipt (US18)", () => {
  it("shows registration details without payment or medical content", () => {
    render(<ReceiptView receipt={receipt} />);
    expect(screen.getAllByText("VISIT REGISTRATION RECEIPT").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Casey Patient").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Checked in").length).toBeGreaterThan(0);
    expect(screen.queryByText("TOTAL")).not.toBeInTheDocument();
    expect(screen.queryByText("Payment")).not.toBeInTheDocument();
  });

  it("downloads the receipt as a PDF", async () => {
    render(<ReceiptView receipt={receipt} />);
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(downloadReceiptPdf).toHaveBeenCalledWith(receipt));
    expect(receiptFileName(receipt)).toBe("HappyPatient-receipt-HP-ABC12345.pdf");
  });
});
