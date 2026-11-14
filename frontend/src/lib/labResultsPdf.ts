import type { jsPDF as JsPdf } from "jspdf";
import type { LabResult, MedicalEntry } from "../components/MedicalHistory";
import { rangeText, resultFlag } from "../components/MedicalHistory";
import { addNotoFont, loadNotoFont } from "./pdfFont";

const TZ = "Asia/Almaty";
const dateText = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: TZ }).format(new Date(value));
const stamp = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const PAGE_W = 210; const PAGE_H = 297; const M = 16; const INNER = PAGE_W - M * 2;
const BLUE = "#2D5FF5"; const INK = "#111D40"; const MUTED = "#5B6684"; const RED = "#B42318"; const GREEN = "#15803D";
const COLS = [0, 70, 112, 160]; // test, result, normal range, flag (mm from the left margin)

export const labResultsFileName = () => `HappyPatient-test-results-${stamp()}.pdf`;
const numberText = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value);

/** Test notes with their measured values, newest visit first, as an A4 report the patient can keep or share. */
export async function buildLabResultsPdf(entries: MedicalEntry[], patientName: string) {
  const { jsPDF } = await import("jspdf");
  const font = await loadNotoFont();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  addNotoFont(doc, font);
  doc.setProperties({ title: "Test results", author: "HappyPatient", subject: `Test results for ${patientName}` });
  let y = M;
  const text = (value: string, x: number, size: number, color = INK, bold = false) => { doc.setFont("NotoSans", bold ? "bold" : "normal").setFontSize(size).setTextColor(color).text(value, x, y); };
  const ensure = (height: number) => { if (y + height > PAGE_H - M) { doc.addPage(); y = M; } };

  // Header
  doc.setFillColor(BLUE).rect(0, 0, PAGE_W, 30, "F");
  y = 14; doc.setFont("NotoSans", "bold").setFontSize(18).setTextColor("#FFFFFF").text("HappyPatient", M, y);
  y = 22; doc.setFont("NotoSans", "normal").setFontSize(10).text("Test results", M, y);
  doc.text(`Issued ${dateText(new Date().toISOString())}`, PAGE_W - M, y, { align: "right" });
  y = 42; text(patientName, M, 14, INK, true);
  y += 6; text(`${entries.length} test ${entries.length === 1 ? "note" : "notes"} · values outside the normal range are marked Low or High`, M, 9, MUTED);
  y += 10;

  for (const entry of entries) {
    const results: LabResult[] = entry.results ?? [];
    ensure(24);
    doc.setDrawColor("#D7DEF0").setLineWidth(0.3).line(M, y - 5, PAGE_W - M, y - 5);
    text(entry.title, M, 12, INK, true);
    doc.setFont("NotoSans", "normal").setFontSize(10).setTextColor(MUTED).text(dateText(entry.eventAt ?? entry.appointmentStartAt ?? entry.createdAt), PAGE_W - M, y, { align: "right" });
    y += 5.5;
    text(`Dr. ${entry.doctor.user.firstName} ${entry.doctor.user.lastName}${entry.specialty ? ` · ${entry.specialty}` : ""}`, M, 9.5, MUTED);
    y += 7;
    if (results.length) {
      ensure(8);
      ["Test", "Result", "Normal range", ""].forEach((label, index) => text(label, M + COLS[index], 8.5, MUTED, true));
      y += 2; doc.setDrawColor("#E3E8F5").line(M, y, PAGE_W - M, y); y += 5;
      for (const result of results) {
        const nameLines = doc.setFont("NotoSans", "normal").setFontSize(10).splitTextToSize(result.name, COLS[1] - 4) as string[];
        const rowHeight = Math.max(1, nameLines.length) * 4.6 + 2;
        ensure(rowHeight);
        const flag = resultFlag(result);
        doc.setFont("NotoSans", "normal").setFontSize(10).setTextColor(INK).text(nameLines, M, y);
        text(`${numberText(result.value)}${result.unit ? ` ${result.unit}` : ""}`, M + COLS[1], 10, flag === "low" || flag === "high" ? RED : INK, true);
        text(rangeText(result) ? `${rangeText(result)}${result.unit ? ` ${result.unit}` : ""}` : "—", M + COLS[2], 10, MUTED);
        if (flag) text(flag === "normal" ? "Normal" : flag === "low" ? "Low" : "High", M + COLS[3], 10, flag === "normal" ? GREEN : RED, true);
        y += rowHeight;
      }
    }
    if (entry.body) {
      const lines = doc.setFont("NotoSans", "normal").setFontSize(9.5).splitTextToSize(entry.body, INNER) as string[];
      for (const line of lines) { ensure(5); text(line, M, 9.5, INK); y += 4.6; }
    }
    y += 9;
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page).setFont("NotoSans", "normal").setFontSize(8).setTextColor(MUTED);
    doc.text("Private medical information. Ask your doctor to explain these results.", M, PAGE_H - 8);
    doc.text(`Page ${page} of ${pages}`, PAGE_W - M, PAGE_H - 8, { align: "right" });
  }
  return doc as JsPdf;
}

export async function downloadLabResultsPdf(entries: MedicalEntry[], patientName: string) {
  const doc = await buildLabResultsPdf(entries, patientName);
  doc.save(labResultsFileName());
}
