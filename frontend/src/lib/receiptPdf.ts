import type { jsPDF as JsPdf } from "jspdf";
import type { Receipt } from "./api";

const TZ = "Asia/Almaty";
const date = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ }).format(new Date(value));
const time = (value: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(value));

const WIDTH = 80; // mm, standard thermal receipt roll
const MARGIN = 6;
const INNER = WIDTH - MARGIN * 2;

export function receiptFileName(receipt: Receipt) {
  return `HappyPatient-receipt-${receipt.reference}.pdf`;
}

/** Draws the receipt and returns the y position where content ended. */
function draw(doc: JsPdf, receipt: Receipt): number {
  const issued = receipt.checkedInAt ?? receipt.createdAt;
  let y = MARGIN + 2;

  const center = (text: string, size: number, style: "normal" | "bold" = "normal", gap = 4.2) => {
    doc.setFont("NotoSans", style).setFontSize(size);
    for (const line of doc.splitTextToSize(text, INNER) as string[]) {
      doc.text(line, WIDTH / 2, y, { align: "center" });
      y += gap;
    }
  };
  const dashed = () => {
    doc.setLineDashPattern([1, 1], 0).setLineWidth(0.2).line(MARGIN, y - 1.5, WIDTH - MARGIN, y - 1.5).setLineDashPattern([], 0);
    y += 2.5;
  };
  const solid = (width = 0.5) => { doc.setLineWidth(width).line(MARGIN, y - 1.5, WIDTH - MARGIN, y - 1.5); y += 2.5; };
  const row = (label: string, value: string, bold = false, size = 8.5) => {
    doc.setFont("NotoSans", bold ? "bold" : "normal").setFontSize(size);
    const labelWidth = doc.getTextWidth(`${label} `);
    const lines = doc.splitTextToSize(value, INNER - labelWidth) as string[];
    doc.text(label, MARGIN, y);
    lines.forEach((line, index) => doc.text(line, WIDTH - MARGIN, y + index * 3.8, { align: "right" }));
    y += Math.max(1, lines.length) * 3.8 + 0.4;
  };

  // logo
  doc.setLineWidth(0.5).circle(WIDTH / 2, y + 2, 3.2);
  doc.setFont("NotoSans", "bold").setFontSize(12).text("+", WIDTH / 2, y + 3.6, { align: "center" });
  y += 9;
  center("HappyPatient", 10, "bold", 4.6);
  center(receipt.address ?? receipt.clinic ?? "Almaty, Kazakhstan", 7.5, "normal", 3.4);
  y += 2;

  solid();
  center("VISIT REGISTRATION RECEIPT", 9, "bold", 3.6);
  solid();

  row("Receipt ID", receipt.id, true);
  row("Booking ID", receipt.reference);
  row("Issued", issued ? `${date(issued)} ${time(issued)} (Asia/Almaty)` : "Unavailable");
  dashed();

  row("Patient", receipt.patientDisplayName);
  if (receipt.patientMaskedIin) row("IIN", receipt.patientMaskedIin.replace(/•/g, "*"));
  row("Doctor", receipt.doctor);
  if (receipt.specialty) row("Specialty", receipt.specialty);
  if (receipt.office) row("Office", receipt.office);
  row("Appointment", `${date(receipt.startAt)} ${time(receipt.startAt)}-${time(receipt.endAt)}`);
  if (receipt.checkedInAt) row("Arrived", `${date(receipt.checkedInAt)} ${time(receipt.checkedInAt)} (Asia/Almaty)`);
  if (receipt.checkedInBy) row("Checked in by", receipt.checkedInBy);
  dashed();

  row("Status", receipt.status === "OCCUPIED" ? "Checked in" : receipt.status);
  y += 3;

  // barcode generated from the reference
  const bars: Array<{ x: number; w: number }> = [];
  let units = 0;
  for (const char of `*${receipt.reference}*`) {
    const code = char.charCodeAt(0);
    for (let bit = 0; bit < 6; bit += 1) {
      const w = ((code >> bit) & 1) + 1;
      if (bit % 2 === 0) bars.push({ x: units, w });
      units += w + 1;
    }
  }
  const scale = INNER / units;
  doc.setFillColor(0, 0, 0);
  bars.forEach((bar) => doc.rect(MARGIN + bar.x * scale, y, bar.w * scale, 11, "F"));
  y += 14;
  center(receipt.reference.split("").join(" "), 7.5, "normal", 5);

  center("Please take a seat in the waiting area. Show this receipt when your name is called.", 7.5, "normal", 3.4);
  y += 1;
  center("Thank you for choosing HappyPatient!", 8.5, "bold", 5);
  doc.setTextColor(120);
  center("Registration completed successfully. Not a fiscal or payment receipt.", 6.5, "normal", 3);
  doc.setTextColor(0);
  return y;
}

export async function buildReceiptPdf(receipt: Receipt) {
  const { jsPDF } = await import("jspdf");
  const response = await fetch("/fonts/NotoSans-Regular.ttf");
  if (!response.ok) throw new Error("Receipt font unavailable");
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const font = btoa(binary);
  const addFont = (doc: JsPdf) => {
    doc.addFileToVFS("NotoSans.ttf", font);
    doc.addFont("NotoSans.ttf", "NotoSans", "normal");
    doc.addFont("NotoSans.ttf", "NotoSans", "bold");
    doc.setTextColor("#111D40").setDrawColor("#2D5FF5");
  };
  // first pass measures the content height, second pass draws on a page of exactly that height
  const measure = new jsPDF({ unit: "mm", format: [WIDTH, 400] });
  addFont(measure);
  const height = Math.ceil(draw(measure, receipt) + MARGIN);
  const doc = new jsPDF({ unit: "mm", format: [WIDTH, height] });
  addFont(doc);
  doc.setProperties({ title: `Receipt ${receipt.reference}`, author: "HappyPatient", subject: "Visit registration receipt" });
  draw(doc, receipt);
  return doc;
}

export async function downloadReceiptPdf(receipt: Receipt) {
  const doc = await buildReceiptPdf(receipt);
  doc.save(receiptFileName(receipt));
}
