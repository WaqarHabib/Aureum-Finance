// BillFlow shared types + recurrence/forecast helpers.

export type Recurrence = "none" | "weekly" | "biweekly" | "monthly";

export const INCOME_CATEGORIES = [
  "Salary",
  "Freelance",
  "Gift",
  "Refund",
  "Investment",
  "Other",
] as const;

export const EXPENSE_CATEGORIES = [
  "Housing",
  "Utilities",
  "Food",
  "Transport",
  "Subscription",
  "Insurance",
  "Entertainment",
  "Health",
  "Debt",
  "Shopping",
  "Other",
] as const;

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD (first/anchor occurrence)
  type: "income" | "expense";
  paid?: boolean; // for bills (non-recurring only)
  recurrence?: Recurrence;
  category?: string;
}

export interface Occurrence extends Transaction {
  occursOn: string; // YYYY-MM-DD
  signedAmount: number; // +income, -expense
  parentId: string; // original transaction id
  isRecurringInstance: boolean;
}

export type RiskLevel = "safe" | "watch" | "danger" | "neutral";

/** Classify end-of-day projected balance against a safety threshold. */
export function dayRiskLevel(
  balance: number | undefined,
  threshold: number,
): RiskLevel {
  if (balance === undefined) return "neutral";
  if (balance < 0) return "danger";
  if (balance < threshold) return "watch";
  return "safe";
}

/** Safety threshold ~ one week of avg monthly expenses (min $100). */
export function computeSafetyThreshold(monthlyExpenseAvg: number): number {
  const oneWeek = (monthlyExpenseAvg * 7) / 30;
  return Math.max(100, Math.round(oneWeek));
}

export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addMonthsClamped(d: Date, n: number): Date {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), lastDay));
  return target;
}

/** Expand a single transaction into concrete occurrences within [from, to] inclusive. */
export function expandTransaction(t: Transaction, from: Date, to: Date): Occurrence[] {
  const start = parseYmd(t.date);
  const occurrences: Occurrence[] = [];
  const sign = t.type === "income" ? 1 : -1;

  const push = (d: Date, instance: boolean) => {
    if (d < from || d > to) return;
    occurrences.push({
      ...t,
      occursOn: ymd(d),
      signedAmount: sign * t.amount,
      parentId: t.id,
      isRecurringInstance: instance,
    });
  };

  const rec = t.recurrence ?? "none";
  if (rec === "none") {
    push(start, false);
    return occurrences;
  }

  // Walk forward from start until past `to`, capped to avoid runaway loops.
  const max = 600;
  let cursor = new Date(start);
  let i = 0;
  while (cursor <= to && i < max) {
    push(cursor, i > 0);
    i += 1;
    if (rec === "weekly") cursor = addDays(cursor, 7);
    else if (rec === "biweekly") cursor = addDays(cursor, 14);
    else if (rec === "monthly") cursor = addMonthsClamped(start, i);
  }
  return occurrences;
}

export function expandAll(
  txs: Transaction[],
  from: Date,
  to: Date,
): Occurrence[] {
  const out: Occurrence[] = [];
  for (const t of txs) out.push(...expandTransaction(t, from, to));
  out.sort((a, b) => a.occursOn.localeCompare(b.occursOn));
  return out;
}

export interface ForecastPoint {
  date: string;
  balance: number;
}

/** Running balance series; one point per occurrence date. */
export function buildForecast(
  startingBalance: number,
  occurrences: Occurrence[],
): { series: ForecastPoint[]; firstNegativeDate: string | null; endBalance: number } {
  let running = startingBalance;
  const series: ForecastPoint[] = [];
  let firstNeg: string | null = null;
  for (const o of occurrences) {
    running += o.signedAmount;
    series.push({ date: o.occursOn, balance: running });
    if (firstNeg === null && running < 0) firstNeg = o.occursOn;
  }
  return { series, firstNegativeDate: firstNeg, endBalance: running };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function formatCurrencyCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatLongDate(s: string): string {
  return parseYmd(s).toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
