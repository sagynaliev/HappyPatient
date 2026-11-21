import { Icon } from "./Icons";
import "../styles/patientAppointments.css";

/** A visit's price as the patient sees it: consultation, treatments, total, and the parking estimate. */
export type ParkingCost = { durationMinutes: number; amountKzt: number; ratePerHourKzt?: number | null; freeMinutes?: number; rounding?: string; dailyCapKzt?: number | null };
export type VisitCostData = { consultationKzt: number; totalKzt: number; bookedAt?: string; lines?: Array<{ kind: "consultation" | "treatment"; label: string; amountKzt: number }>; parking: ParkingCost | null };

const formatFee = (value: number) => `${new Intl.NumberFormat("en-US").format(value)} KZT`;

/** The receipt shown under "View details" in My appointments. Admins see the same component with sample data. */
export function VisitPriceReceipt({ cost }: { cost: VisitCostData }) {
  const bookedOn = cost.bookedAt ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Almaty" }).format(new Date(cost.bookedAt)) : "";
  const treatments = (cost.lines ?? []).filter((line) => line.kind === "treatment");
  return <>
    {/* A receipt: each charge on its own line, the total, and when the price was fixed. */}
    <div className="pa-receipt">
      <p className="pa-receipt-eyebrow">Visit price</p>
      <dl className="pa-price-list">
        <div><dt>Consultation fee</dt><dd>{formatFee(cost.consultationKzt)}</dd></div>
        {treatments.map((line, index) => <div key={`${line.label}-${index}`}><dt>{line.label}<small>Treatment</small></dt><dd>{formatFee(line.amountKzt)}</dd></div>)}
        <div className="pa-price-total"><dt>Visit total</dt><dd>{formatFee(cost.totalKzt)}</dd></div>
      </dl>
      {bookedOn && <p className="pa-receipt-band"><Icon name="check" size={16} /> <span>Price fixed when you booked on {bookedOn}</span></p>}
    </div>
    {cost.parking && <ParkingEstimate parking={cost.parking} />}
  </>;
}

/** How the parking estimate was reached: visit length, free minutes, charged time, rate and the daily cap. */
export function ParkingEstimate({ parking }: { parking: ParkingCost }) {
  const money = (value: number) => `${new Intl.NumberFormat("en-US").format(value)} KZT`;
  const free = parking.freeMinutes ?? 0;
  const charged = Math.max(0, parking.durationMinutes - free);
  const rate = parking.ratePerHourKzt ?? null;
  const startedHours = Math.ceil(charged / 60);
  const capped = typeof parking.dailyCapKzt === "number" && rate !== null && (parking.rounding === "per_minute" ? Math.round(charged / 60 * rate) : startedHours * rate) > parking.dailyCapKzt;
  return <div className="pa-receipt is-parking">
    <p className="pa-receipt-eyebrow">Parking estimate</p>
    <dl className="pa-price-list is-steps">
      <div><dt>Visit length</dt><dd>{parking.durationMinutes} min</dd></div>
      {free > 0 && <div><dt>Free parking</dt><dd>− {free} min</dd></div>}
      {rate !== null && <div><dt>{parking.rounding === "per_minute" ? `${charged} min × ${money(rate)} / hour` : `${startedHours} started ${startedHours === 1 ? "hour" : "hours"} × ${money(rate)}`}</dt><dd>{capped ? "" : money(parking.amountKzt)}</dd></div>}
      {capped && <div><dt>Daily cap applied</dt><dd>{money(parking.dailyCapKzt as number)}</dd></div>}
      <div className="pa-price-total"><dt>Estimate</dt><dd>{money(parking.amountKzt)}</dd></div>
    </dl>
    <p className="pa-receipt-note">{typeof parking.dailyCapKzt === "number" ? `Max ${money(parking.dailyCapKzt)} a day · paid at the car park` : "Paid at the car park"}</p>
  </div>;
}

