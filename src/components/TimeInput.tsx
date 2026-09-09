"use client";

// Native <input type="time"> renders in whatever 24-hour/12-hour format
// the browser's locale dictates — not something a value or attribute
// can override cross-browser. This is a plain 12-hour AM/PM picker
// instead, so it reads the same way regardless of locale. Produces and
// consumes the same "HH:MM" 24-hour string the rest of the app already
// uses, so nothing downstream needs to change.

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = ["00", "15", "30", "45"];

interface TimeInputProps {
  value: string; // "HH:MM", 24-hour
  onChange: (value: string) => void;
}

function parse(value: string): { h24: number; minute: string } {
  const parts = value.split(":");
  const h24 = Number.parseInt(parts[0] ?? "", 10) || 0;
  const minute = MINUTES.includes(parts[1] ?? "") ? (parts[1] as string) : "00";
  return { h24, minute };
}

/** Formats a "HH:MM" 24-hour string as e.g. "6:00 PM", for display next to the picker above. */
export function formatTime12h(value: string): string {
  const { h24, minute } = parse(value);
  const isPM = h24 >= 12;
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${hour12}:${minute} ${isPM ? "PM" : "AM"}`;
}

export function TimeInput({ value, onChange }: TimeInputProps) {
  const { h24, minute } = parse(value);
  const isPM = h24 >= 12;
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;

  function update(nextHour12: number, nextMinute: string, nextIsPM: boolean) {
    const h = (nextHour12 % 12) + (nextIsPM ? 12 : 0);
    onChange(`${String(h).padStart(2, "0")}:${nextMinute}`);
  }

  return (
    <span style={{ display: "inline-flex", gap: "0.25rem", alignItems: "center" }}>
      <select value={hour12} onChange={(e) => update(Number(e.target.value), minute, isPM)}>
        {HOURS.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span>:</span>
      <select value={minute} onChange={(e) => update(hour12, e.target.value, isPM)}>
        {MINUTES.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <select value={isPM ? "PM" : "AM"} onChange={(e) => update(hour12, minute, e.target.value === "PM")}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </span>
  );
}
