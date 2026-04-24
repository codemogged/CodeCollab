/** Return a short date+time timestamp, e.g. "Apr 19, 3:42 PM". */
export function nowTimestamp(): string {
  const d = new Date();
  const date = d.toLocaleDateString([], { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${date}, ${time}`;
}
