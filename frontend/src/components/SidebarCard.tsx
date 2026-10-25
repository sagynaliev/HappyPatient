import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Role, authApi } from "../lib/api";
import { onNotificationsChanged } from "../lib/notificationEvents";
import { Icon, IconName } from "./Icons";

const TZ = "Asia/Almaty";
const shortWhen = (value: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ }).format(new Date(value));
const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

type CardContent = { icon: IconName; label: string; title: string; text: string; to: string; action: string };

/** Role-specific summary at the foot of the sidebar: the one thing each person most often needs next. */
async function loadCard(role: Role): Promise<CardContent | null> {
  if (role === "PATIENT") {
    const { appointments } = await authApi.myAppointments();
    const next = appointments
      .filter((item) => (item.status === "BOOKED" || item.status === "OCCUPIED") && Date.parse(item.endAt) > Date.now())
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))[0];
    return next
      ? { icon: "calendar", label: "Next visit", title: shortWhen(next.startAt), text: next.doctor.name, to: "/appointments", action: "View visit" }
      : { icon: "search", label: "No visits planned", title: "Book a visit", text: "Find a doctor and pick a free time.", to: "/search", action: "Find a doctor" };
  }
  if (role === "DOCTOR") {
    const { doctor } = await authApi.doctorProfile();
    const { slots } = await authApi.getSchedule(doctor.id, todayKey());
    const booked = slots.filter((slot) => slot.status !== "FREE").length;
    return { icon: "clock", label: "Today", title: `${booked} ${booked === 1 ? "visit" : "visits"}`, text: `${slots.filter((slot) => slot.status === "FREE").length} free slots left today`, to: "/doctor/schedule", action: "Open schedule" };
  }
  if (role === "FRONT_DESK" || role === "ADMIN") {
    const { appointments } = await authApi.frontDeskAppointments();
    const waiting = appointments.filter((item) => item.status === "BOOKED" && new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(item.startAt)) === todayKey()).length;
    return { icon: "desk", label: "Front desk", title: `${waiting} waiting`, text: "Patients booked for today who have not checked in yet.", to: "/front-desk/walk-in", action: "+ Walk-in" };
  }
  return null;
}

export function SidebarCard({ role, collapsed }: { role: Role; collapsed: boolean }) {
  const [card, setCard] = useState<CardContent | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => { loadCard(role).then((result) => { if (active) setCard(result); }).catch(() => { if (active) setCard(null); }); };
    refresh();
    const unsubscribe = onNotificationsChanged(refresh);
    return () => { active = false; unsubscribe(); };
  }, [role]);

  if (!card) return null;
  if (collapsed) {
    return (
      <Link className="hp-side-card is-collapsed" to={card.to} aria-label={`${card.label}: ${card.title}`} data-tooltip={`${card.label}: ${card.title}`}>
        <Icon name={card.icon} size={22} />
      </Link>
    );
  }
  return (
    <section className="hp-side-card" aria-label={card.label}>
      <div className="hp-side-card-head">
        <span className="hp-side-card-icon"><Icon name={card.icon} size={20} /></span>
        <div><small>{card.label}</small><strong>{card.title}</strong></div>
      </div>
      <p>{card.text}</p>
      <Link className="hp-side-card-action" to={card.to}>{card.action}</Link>
    </section>
  );
}
