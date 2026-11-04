import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { appClockOffsetMinutes } from "../lib/appClock";
import { formatInClinic } from "../lib/almaty";
import { Icon } from "./Icons";
import "../styles/demoTime.css";

export function formatOffset(minutes: number) {
  const sign = minutes < 0 ? "−" : "+";
  const abs = Math.abs(minutes);
  const days = Math.floor(abs / 1440);
  const hours = Math.floor((abs % 1440) / 60);
  const mins = abs % 60;
  return sign + [days && `${days} d`, hours && `${hours} h`, mins && `${mins} min`].filter(Boolean).join(" ");
}

/** Always visible while the demo clock is shifted, so nobody mistakes demo time for real time. */
export function DemoTimeBadge() {
  const { user } = useAuth();
  const offset = appClockOffsetMinutes();
  if (!offset) return null;
  return (
    <div className="demo-time-badge" role="status">
      <Icon name="clock" size={16} />
      <span><strong>Demo time</strong> {formatInClinic(new Date(), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} · {formatOffset(offset)}</span>
      {user?.role === "ADMIN" && <Link to="/admin/time">Change</Link>}
    </div>
  );
}
