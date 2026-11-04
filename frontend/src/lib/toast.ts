/** App-wide toast notifications. A tiny store so any page can announce an outcome without a provider. */
export type ToastTone = "neutral" | "info" | "success" | "warning" | "error";
export type Toast = { id: number; tone: ToastTone; title: string; message?: string; durationMs: number };

type Listener = (toasts: Toast[]) => void;
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((listener) => listener(toasts));

export function subscribeToasts(listener: Listener) {
  listeners.add(listener);
  listener(toasts);
  return () => { listeners.delete(listener); };
}

export function dismissToast(id: number) {
  toasts = toasts.filter((item) => item.id !== id);
  emit();
}

export function showToast(input: { tone?: ToastTone; title: string; message?: string; durationMs?: number }) {
  const tone = input.tone ?? "neutral";
  const toast: Toast = { id: nextId++, tone, title: input.title, message: input.message, durationMs: input.durationMs ?? (tone === "error" || tone === "warning" ? 8000 : 5000) };
  // Keep the stack short: the newest four stay visible.
  toasts = [...toasts.filter((item) => item.title !== toast.title || item.message !== toast.message), toast].slice(-4);
  emit();
  return toast.id;
}

export const toast = {
  neutral: (title: string, message?: string) => showToast({ tone: "neutral", title, message }),
  info: (title: string, message?: string) => showToast({ tone: "info", title, message }),
  success: (title: string, message?: string) => showToast({ tone: "success", title, message }),
  warning: (title: string, message?: string) => showToast({ tone: "warning", title, message }),
  error: (title: string, message?: string) => showToast({ tone: "error", title, message }),
};
