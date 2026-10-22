import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Receipt } from "../lib/api";
import { downloadReceiptPdf } from "../lib/receiptPdf";
import "../styles/receipt.css";

const TZ = "Asia/Almaty";
const date = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ }).format(new Date(value));
const time = (value: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(value));
const money = (value: number) => `${new Intl.NumberFormat("ru-RU").format(value)} ₸`;

/** Deterministic barcode-style bars generated from the receipt reference. */
function Barcode({ value }: { value: string }) {
  const bars: Array<{ x: number; w: number }> = [];
  let x = 0;
  for (const char of `*${value}*`) {
    const code = char.charCodeAt(0);
    for (let bit = 0; bit < 6; bit += 1) {
      const w = ((code >> bit) & 1) + 1;
      if (bit % 2 === 0) bars.push({ x, w });
      x += w + 1;
    }
  }
  return (
    <svg className="receipt-barcode" viewBox={`0 0 ${x} 40`} preserveAspectRatio="none" aria-hidden="true">
      {bars.map((bar, index) => <rect key={index} x={bar.x} y={0} width={bar.w} height={40} />)}
    </svg>
  );
}

function ReceiptSlip({ receipt }: { receipt: Receipt }) {
  const issued = receipt.checkedInAt ?? receipt.createdAt ?? new Date().toISOString();
  const fee = receipt.consultationFee ?? 0;
  return (
    <div className="receipt-slip">
      <header className="receipt-slip-header">
        <div className="receipt-logo" aria-hidden="true">+</div>
        <strong>HappyPatient Medical Center</strong>
        <span>{receipt.address ?? receipt.clinic ?? "Almaty, Kazakhstan"}</span>
        <span>Front desk · +7 727 000 00 00</span>
      </header>

      <div className="receipt-title">VISIT REGISTRATION RECEIPT</div>

      <dl className="receipt-rows">
        <div><dt>Receipt No.</dt><dd>{receipt.reference}</dd></div>
        <div><dt>Issued</dt><dd>{date(issued)} {time(issued)}</dd></div>
      </dl>

      <hr />

      <dl className="receipt-rows">
        <div><dt>Patient</dt><dd>{receipt.patientDisplayName}</dd></div>
        {receipt.patientMaskedIin && <div><dt>IIN</dt><dd>{receipt.patientMaskedIin}</dd></div>}
        <div><dt>Doctor</dt><dd>{receipt.doctor}</dd></div>
        {receipt.specialty && <div><dt>Specialty</dt><dd>{receipt.specialty}</dd></div>}
        {receipt.office && <div><dt>Office</dt><dd>{receipt.office}</dd></div>}
        <div><dt>Appointment</dt><dd>{date(receipt.startAt)} {time(receipt.startAt)}–{time(receipt.endAt)}</dd></div>
        {receipt.checkedInAt && <div><dt>Arrived</dt><dd>{time(receipt.checkedInAt)}</dd></div>}
        {receipt.checkedInBy && <div><dt>Checked in by</dt><dd>{receipt.checkedInBy}</dd></div>}
        {receipt.visitPurpose && <div><dt>Purpose</dt><dd>{receipt.visitPurpose}</dd></div>}
      </dl>

      <hr />

      <table className="receipt-items">
        <thead><tr><th>Service</th><th>Qty</th><th>Amount</th></tr></thead>
        <tbody>
          <tr><td>Consultation{receipt.specialty ? ` — ${receipt.specialty}` : ""}</td><td>1</td><td>{money(fee)}</td></tr>
        </tbody>
      </table>

      <dl className="receipt-rows receipt-total">
        <div><dt>TOTAL</dt><dd>{money(fee)}</dd></div>
        <div><dt>Payment</dt><dd>At reception</dd></div>
        <div><dt>Status</dt><dd>{receipt.status === "OCCUPIED" ? "Checked in" : receipt.status}</dd></div>
      </dl>

      <Barcode value={receipt.reference} />
      <div className="receipt-reference">{receipt.reference}</div>

      <p className="receipt-note">Please take a seat in the waiting area. Show this receipt when your name is called.</p>
      <p className="receipt-thanks">Thank you for choosing HappyPatient!</p>
      <p className="receipt-disclaimer">Alpha version · sample receipt · not a fiscal document</p>
    </div>
  );
}

export function ReceiptView({ receipt, onClose }: { receipt: Receipt; onClose?: () => void }) {
  useEffect(() => {
    const cleanup = () => document.body.classList.remove("hp-printing-receipt");
    window.addEventListener("afterprint", cleanup);
    return () => { window.removeEventListener("afterprint", cleanup); cleanup(); };
  }, []);

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  async function download() {
    setDownloading(true); setDownloadError("");
    try { await downloadReceiptPdf(receipt); }
    catch { setDownloadError("The PDF could not be created. Please try again or print the receipt."); }
    finally { setDownloading(false); }
  }

  function print() {
    document.body.classList.add("hp-printing-receipt");
    window.print();
  }

  return (
    <>
      <section className="receipt-view" aria-label="Registration receipt">
        <ReceiptSlip receipt={receipt} />
        <div className="receipt-actions">
          <button className="button" type="button" disabled={downloading} onClick={() => void download()}>{downloading ? "Preparing PDF…" : "Download PDF"}</button>
          <button className="button button-outline" type="button" onClick={print}>Print receipt</button>
          {onClose && <button className="button button-outline" type="button" onClick={onClose}>Close</button>}
        </div>
        {downloadError && <p className="receipt-error" role="alert">{downloadError}</p>}
      </section>
      {createPortal(<div className="receipt-print-portal"><ReceiptSlip receipt={receipt} /></div>, document.body)}
    </>
  );
}
