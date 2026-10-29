import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Receipt } from "../lib/api";
import { downloadReceiptPdf } from "../lib/receiptPdf";
import "../styles/receipt.css";

const TZ = "Asia/Almaty";
const date = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ }).format(new Date(value));
const time = (value: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(value));

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
  const issued = receipt.checkedInAt ?? receipt.createdAt;
  return (
    <div className="receipt-slip">
      <header className="receipt-slip-header">
        <div className="receipt-logo" aria-hidden="true">+</div>
        <strong>HappyPatient</strong>
        <span>{receipt.address ?? receipt.clinic ?? "Almaty, Kazakhstan"}</span>
      </header>

      <div className="receipt-title">VISIT REGISTRATION RECEIPT</div>

      <dl className="receipt-rows">
        <div><dt>Receipt ID</dt><dd>{receipt.id}</dd></div>
        <div><dt>Booking ID</dt><dd>{receipt.reference}</dd></div>
        <div><dt>Issued</dt><dd>{issued ? `${date(issued)} ${time(issued)} (Asia/Almaty)` : "Unavailable"}</dd></div>
      </dl>

      <hr />

      <dl className="receipt-rows">
        <div><dt>Patient</dt><dd>{receipt.patientDisplayName}</dd></div>
        {receipt.patientMaskedIin && <div><dt>IIN</dt><dd>{receipt.patientMaskedIin}</dd></div>}
        <div><dt>Doctor</dt><dd>{receipt.doctor}</dd></div>
        {receipt.specialty && <div><dt>Specialty</dt><dd>{receipt.specialty}</dd></div>}
        {receipt.office && <div><dt>Office</dt><dd>{receipt.office}</dd></div>}
        <div><dt>Appointment</dt><dd>{date(receipt.startAt)} {time(receipt.startAt)}–{time(receipt.endAt)}</dd></div>
        {receipt.checkedInAt && <div><dt>Arrived</dt><dd>{date(receipt.checkedInAt)} {time(receipt.checkedInAt)} (Asia/Almaty)</dd></div>}
        {receipt.checkedInBy && <div><dt>Checked in by</dt><dd>{receipt.checkedInBy}</dd></div>}
      </dl>

      <hr />

      <dl className="receipt-rows">
        <div><dt>Status</dt><dd>{receipt.status === "OCCUPIED" ? "Checked in" : receipt.status}</dd></div>
      </dl>

      <Barcode value={receipt.reference} />
      <div className="receipt-reference">{receipt.reference}</div>

      <p className="receipt-note">Please take a seat in the waiting area. Show this receipt when your name is called.</p>
      <p className="receipt-thanks">Thank you for choosing HappyPatient!</p>
      <p className="receipt-disclaimer">Registration completed successfully. Not a fiscal or payment receipt.</p>
    </div>
  );
}

export function ReceiptView({ receipt }: { receipt: Receipt }) {
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
        {/* Actions float over the bottom of the receipt so they are reachable without scrolling. */}
        <div className="receipt-actions" role="toolbar" aria-label="Receipt actions">
          <button className="receipt-action is-primary" type="button" disabled={downloading} onClick={() => void download()}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" /></svg>
            {downloading ? "Preparing PDF…" : "Download PDF"}
          </button>
          <button className="receipt-action" type="button" onClick={print}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2M7 14h10v6H7z" /></svg>
            Print receipt
          </button>
        </div>
        {downloadError && <p className="receipt-error" role="alert">{downloadError}</p>}
      </section>
      {createPortal(<div className="receipt-print-portal"><ReceiptSlip receipt={receipt} /></div>, document.body)}
    </>
  );
}

/** Receipt in a dialog: the receipt scrolls inside, the action bar stays on top of it. */
export function ReceiptDialog({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="receipt-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="receipt-modal" role="dialog" aria-modal="true" aria-label={`Receipt ${receipt.reference}`}>
        <ReceiptView receipt={receipt} />
      </div>
    </div>
  );
}
