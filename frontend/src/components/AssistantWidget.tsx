import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { ApiError, AssistantBookingCard, AssistantMessage, assistantApi, authApi } from "../lib/api";
import { notifyNotificationsChanged } from "../lib/notificationEvents";
import { Icon } from "./Icons";
import "../styles/assistant.css";

type ChatEntry = AssistantMessage & { cards?: AssistantBookingCard[]; error?: boolean };
type CardState = { selected: string; status: "idle" | "booking" | "booked" | "failed"; message?: string };

const STORAGE_KEY = "hp_assistant_chat";
const CARDS_KEY = "hp_assistant_cards";
const SUGGESTIONS = ["Find a doctor for tomorrow", "What are my upcoming visits?", "How does check-in work?", "How much is a follow-up visit?"];
const TZ = "Asia/Almaty";
const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).format(new Date(iso));
const timeLabel = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ }).format(new Date(iso));
const kzt = (amount: number) => `${amount.toLocaleString("en-US").replace(/,/g, " ")} ₸`;

function loadChat(): ChatEntry[] {
  try { const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]"); return Array.isArray(saved) ? saved : []; } catch { return []; }
}
/** Card choices survive page changes, so a booked card never offers Confirm again. Unfinished bookings reset to idle. */
function loadCardStates(): Record<string, CardState> {
  try {
    const saved = JSON.parse(sessionStorage.getItem(CARDS_KEY) ?? "{}") as Record<string, CardState>;
    return Object.fromEntries(Object.entries(saved).map(([key, state]) => [key, state.status === "booking" ? { ...state, status: "idle" } : state]));
  } catch { return {}; }
}

/** Groups a reply's cards by doctor and format, so several proposed times show as chips on one card. */
function groupCards(cards: AssistantBookingCard[]) {
  const groups = new Map<string, AssistantBookingCard[]>();
  for (const card of cards) { const key = `${card.doctorId}|${card.channel}`; groups.set(key, [...(groups.get(key) ?? []), card]); }
  return [...groups.values()];
}

function BookingCard({ options, state, onSelect, onConfirm }: { options: AssistantBookingCard[]; state: CardState; onSelect: (slotId: string) => void; onConfirm: () => void }) {
  const chosen = options.find((option) => option.slotId === state.selected) ?? options[0];
  const done = state.status === "booked";
  return (
    <div className="hp-assistant-card">
      <div className="hp-assistant-card-head">
        <span className="hp-assistant-card-avatar" aria-hidden="true"><Icon name="stethoscope" size={18} /></span>
        <div>
          <strong>{chosen.doctorName}</strong>
          <small>{chosen.specialty}{chosen.channel === "online" ? " · Video call" : chosen.office ? ` · ${chosen.office}` : ""}</small>
        </div>
      </div>
      <p className="hp-assistant-card-day">{dayLabel(chosen.startAt)}</p>
      <div className="hp-assistant-times" role="radiogroup" aria-label="Time">
        {options.map((option) => (
          <button key={option.slotId} type="button" role="radio" aria-checked={option.slotId === chosen.slotId} disabled={done || state.status === "booking"} className="hp-assistant-time" onClick={() => onSelect(option.slotId)}>
            {options.some((other) => dayLabel(other.startAt) !== dayLabel(option.startAt)) ? `${dayLabel(option.startAt).split(" ").slice(1).join(" ")} ${timeLabel(option.startAt)}` : timeLabel(option.startAt)}
          </button>
        ))}
      </div>
      <dl className="hp-assistant-card-facts">
        <div><dt>Format</dt><dd>{chosen.channel === "online" ? "Online" : "In person"} · {chosen.visitKind === "follow-up" ? "follow-up" : "first visit"}</dd></div>
        <div><dt>Price</dt><dd>{kzt(chosen.priceKzt)}</dd></div>
      </dl>
      {done ? (
        <p className="hp-assistant-card-done" role="status"><Icon name="check" size={16} /> {state.message}</p>
      ) : (
        <>
          <button type="button" className="hp-assistant-confirm" disabled={state.status === "booking"} onClick={onConfirm}>{state.status === "booking" ? "Booking…" : "Confirm booking"}</button>
          {state.status === "failed" && <p className="hp-assistant-card-error" role="alert">{state.message}</p>}
        </>
      )}
    </div>
  );
}

/** Floating chat for patients: answers questions about HappyPatient and proposes bookings the patient confirms. */
export function AssistantWidget({ firstName }: { firstName: string }) {
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState<ChatEntry[]>(loadChat);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [cardStates, setCardStates] = useState<Record<string, CardState>>(loadCardStates);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(chat)); } catch { /* storage unavailable */ } }, [chat]);
  useEffect(() => { try { sessionStorage.setItem(CARDS_KEY, JSON.stringify(cardStates)); } catch { /* storage unavailable */ } }, [cardStates]);
  useEffect(() => { if (open) { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; inputRef.current?.focus(); } }, [open, chat, sending]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    const next: ChatEntry[] = [...chat, { role: "user", content }];
    setDraft("");
    await ask(next);
  }

  /** Sends the conversation; on failure adds an error bubble that can resend it (Try again) without retyping. */
  async function ask(next: ChatEntry[]) {
    setChat(next);
    setSending(true);
    try {
      const history = next.filter((entry) => !entry.error).map(({ role, content: body }) => ({ role, content: body }));
      const result = await assistantApi.chat(history);
      setChat((current) => [...current, { role: "assistant", content: result.reply, cards: result.cards.length ? result.cards : undefined }]);
    } catch (error) {
      setChat((current) => [...current, { role: "assistant", content: error instanceof ApiError ? error.message : "The assistant couldn't answer right now. Try again.", error: true }]);
    } finally {
      setSending(false);
    }
  }

  async function confirm(key: string, option: AssistantBookingCard) {
    setCardStates((current) => ({ ...current, [key]: { selected: option.slotId, status: "booking" } }));
    try {
      const result = await authApi.bookSlot(option.doctorId, option.slotId, option.visitPurpose, option.channel);
      notifyNotificationsChanged();
      const summary = `Booked with ${option.doctorName}, ${dayLabel(option.startAt)} at ${timeLabel(option.startAt)}${result.reference ? ` · ${result.reference}` : ""}`;
      setCardStates((current) => ({ ...current, [key]: { selected: option.slotId, status: "booked", message: summary } }));
      setChat((current) => [...current, { role: "assistant", content: `${summary}. You'll find it in My appointments.` }]);
    } catch (error) {
      setCardStates((current) => ({ ...current, [key]: { selected: option.slotId, status: "failed", message: error instanceof ApiError ? error.message : "Booking failed. Try another time." } }));
    }
  }

  function onSubmit(event: FormEvent) { event.preventDefault(); void send(draft); }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(draft); }
  }

  return (
    <div className="hp-assistant">
      {open && (
        <section className="hp-assistant-panel" role="dialog" aria-label="HappyPatient assistant">
          <header className="hp-assistant-head">
            <span className="hp-assistant-logo" aria-hidden="true"><Icon name="spark" size={18} /></span>
            <div>
              <strong>HappyPatient assistant</strong>
              <small><span className="hp-assistant-dot" aria-hidden="true" /> Online</small>
            </div>
            {chat.length > 0 && <button type="button" className="hp-assistant-head-button" onClick={() => { setChat([]); setCardStates({}); }} aria-label="Start a new conversation"><Icon name="refresh" size={17} /></button>}
            <button type="button" className="hp-assistant-head-button" onClick={() => setOpen(false)} aria-label="Close assistant"><Icon name="close" size={18} /></button>
          </header>

          <div className="hp-assistant-body" ref={listRef} aria-live="polite">
            {chat.length === 0 ? (
              <div className="hp-assistant-welcome">
                <h2>Hello {firstName}<br /><span>How can I help you?</span></h2>
                <div className="hp-assistant-suggestions">
                  {SUGGESTIONS.map((text) => <button key={text} type="button" onClick={() => void send(text)}>{text}</button>)}
                </div>
              </div>
            ) : (
              chat.map((entry, index) => (
                <div key={index} className={`hp-assistant-row hp-assistant-row--${entry.role}`}>
                  <p className={`hp-assistant-bubble${entry.error ? " hp-assistant-bubble--error" : ""}`}>{entry.content}</p>
                  {entry.error && index === chat.length - 1 && !sending && <button type="button" className="hp-assistant-retry" onClick={() => void ask(chat.slice(0, -1))}><Icon name="refresh" size={14} /> Try again</button>}
                  {entry.cards && groupCards(entry.cards).map((options) => {
                    const key = `${index}:${options[0].doctorId}:${options[0].channel}`;
                    const state = cardStates[key] ?? { selected: options[0].slotId, status: "idle" as const };
                    return (
                      <BookingCard key={key} options={options} state={state}
                        onSelect={(slotId) => setCardStates((current) => ({ ...current, [key]: { selected: slotId, status: "idle" } }))}
                        onConfirm={() => void confirm(key, options.find((option) => option.slotId === state.selected) ?? options[0])} />
                    );
                  })}
                </div>
              ))
            )}
            {sending && <div className="hp-assistant-row hp-assistant-row--assistant"><p className="hp-assistant-bubble hp-assistant-typing" aria-label="Assistant is typing"><span /><span /><span /></p></div>}
          </div>

          <form className="hp-assistant-input" onSubmit={onSubmit}>
            <textarea ref={inputRef} rows={1} value={draft} maxLength={1500} placeholder="Ask about doctors, times or visits…" aria-label="Message" onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} />
            <button type="submit" disabled={!draft.trim() || sending} aria-label="Send"><Icon name="arrow-right" size={18} /></button>
          </form>
          <p className="hp-assistant-note">AI can make mistakes. It doesn't give medical advice.</p>
        </section>
      )}
      <button type="button" className="hp-assistant-launcher" aria-label={open ? "Close assistant" : "Open assistant"} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Icon name={open ? "close" : "spark"} size={24} />
      </button>
    </div>
  );
}
