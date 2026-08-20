/**
 * Dashboard period math (openspec: consumption-dashboard). Pure calendar
 * arithmetic on YYYY-MM-DD strings; timezone resolution happens at the
 * caller (today comes in resolved).
 */
import { weekStartOf } from "@/domain/planner";

export type Period = "day" | "week" | "month" | "year";

export interface PeriodRange {
  from: string;
  to: string;
  label: string;
}

const MS_PER_DAY = 86_400_000;

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function periodRange(period: Period, anchorIso: string): PeriodRange {
  const anchor = new Date(`${anchorIso}T00:00:00Z`);
  switch (period) {
    case "day":
      return { from: anchorIso, to: anchorIso, label: anchorIso };
    case "week": {
      const from = weekStartOf(anchorIso);
      const to = iso(new Date(new Date(`${from}T00:00:00Z`).getTime() + 6 * MS_PER_DAY));
      return { from, to, label: `week of ${from}` };
    }
    case "month": {
      const from = `${anchorIso.slice(0, 7)}-01`;
      const nextMonth = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1));
      const to = iso(new Date(nextMonth.getTime() - MS_PER_DAY));
      return { from, to, label: anchorIso.slice(0, 7) };
    }
    case "year": {
      const year = anchorIso.slice(0, 4);
      return { from: `${year}-01-01`, to: `${year}-12-31`, label: year };
    }
  }
}

export function shiftAnchor(period: Period, anchorIso: string, delta: number): string {
  const anchor = new Date(`${anchorIso}T00:00:00Z`);
  switch (period) {
    case "day":
      return iso(new Date(anchor.getTime() + delta * MS_PER_DAY));
    case "week":
      return iso(new Date(anchor.getTime() + delta * 7 * MS_PER_DAY));
    case "month": {
      const next = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + delta, 1));
      return iso(next);
    }
    case "year":
      return iso(new Date(Date.UTC(anchor.getUTCFullYear() + delta, 0, 1)));
  }
}
