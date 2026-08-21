export const SHOP = {
  name: "Fake Rider Motorparts",
  tagline: "Motorparts, Accessories & Race-Grade Service",
  address: "Purok Bangkal Sta. Cruz, Baclayon, Bohol, Philippines",
  hours: "Monday to Saturday, 8:00 AM - 5:00 PM",
  phone: "0917 000 0000",
  email: "hello@fakerider.ph",
  facebook: "https://facebook.com",
  noticeHours: 48,
};

export const PRODUCT_CATEGORIES = [
  { value: "part", label: "Parts" },
  { value: "accessory", label: "Accessories" },
  { value: "motorcycle", label: "Motorcycles" },
] as const;

export const APPOINTMENT_STATUSES = [
  "pending",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function statusTone(status: string) {
  switch (status) {
    case "confirmed":
      return "bg-primary/15 text-primary border-primary/30";
    case "in_progress":
      return "bg-accent/15 text-accent border-accent/30";
    case "completed":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "cancelled":
    case "no_show":
      return "bg-destructive/15 text-destructive border-destructive/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function formatPHP(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatTime(value: string) {
  const [h, m] = value.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m} ${suffix}`;
}

export function shopTimeOptions() {
  const options: { value: string; label: string }[] = [];
  for (let h = 8; h <= 17; h++) {
    for (const m of [0, 30]) {
      if (h === 17 && m > 0) continue;
      const time24 = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      options.push({ value: time24, label: formatTime(time24) });
    }
  }
  return options;
}

export function formatDateLong(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Current date/time parts in Asia/Manila. */
export function manilaNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

/** Epoch ms for a Manila local date + time string. */
export function manilaTimestamp(dateIso: string, time: string) {
  return Date.parse(`${dateIso}T${time.slice(0, 5)}:00+08:00`);
}

export function addDays(dateIso: string, days: number) {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

const RANGE_PREFIX = "RANGE:";

export function encodeBlockReason(endTime: string | null, userReason: string): string | null {
  if (!endTime) return userReason || null;
  const base = `${RANGE_PREFIX}${endTime.slice(0, 5)}`;
  return userReason ? `${base}|${userReason}` : base;
}

export function decodeBlockReason(reason: string | null): {
  endTime: string | null;
  userReason: string;
} {
  if (!reason || !reason.startsWith(RANGE_PREFIX))
    return { endTime: null, userReason: reason ?? "" };
  const rest = reason.slice(RANGE_PREFIX.length);
  const pipeIdx = rest.indexOf("|");
  if (pipeIdx === -1) return { endTime: rest, userReason: "" };
  return { endTime: rest.slice(0, 5), userReason: rest.slice(pipeIdx + 1) };
}

/** Booking rule: the slot must start at least 48 hours from now (Manila). */
export function isSlotBookable(dateIso: string, time: string) {
  return manilaTimestamp(dateIso, time) - Date.now() >= SHOP.noticeHours * 3600 * 1000;
}

/** Earliest date that can contain a bookable slot (48 hours from now, Manila). */
export function earliestBookableDate() {
  const now = manilaNow();
  const ts = manilaTimestamp(now.date, `${now.time}:00`);
  const cutoff = ts + SHOP.noticeHours * 3600 * 1000;
  return new Date(cutoff).toLocaleDateString("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
