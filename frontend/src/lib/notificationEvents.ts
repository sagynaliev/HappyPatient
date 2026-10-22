const EVENT_NAME = "hp:notifications-changed";

/** Tell the header bell that an action (booking, cancellation, check-in) may have created a notification. */
export function notifyNotificationsChanged() {
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function onNotificationsChanged(listener: () => void) {
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
