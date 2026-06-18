import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Wallet,
  Download,
  Pencil,
  CalendarDays,
  Repeat,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type Recurrence,
  type Transaction,
  addDays,
  buildForecast,
  computeSafetyThreshold,
  expandAll,
  formatCurrency,
  formatLongDate,
  parseYmd,
  ymd,
} from "@/lib/billflow";
import { CalendarView } from "@/components/CalendarView";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

const STORAGE_KEY = "billflow.state.v2";
const LEGACY_KEY = "fbc.state.v1";

function formatShortDate(dateStr: string): string {
  return parseYmd(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatMonthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

type EntryDialogState =
  | null
  | {
      mode: "add" | "edit";
      kind: "income" | "bill";
      date: string;
      id?: string;
    };

function BillFlowApp() {
  const [hydrated, setHydrated] = useState(false);
  const [startingBalance, setStartingBalance] = useState<string>("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  // Hydrate from storage (with v1 migration).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.startingBalance === "string")
          setStartingBalance(parsed.startingBalance);
        if (Array.isArray(parsed.transactions)) setTransactions(parsed.transactions);
      } else {
        const legacy = window.localStorage.getItem(LEGACY_KEY);
        if (legacy) {
          const p = JSON.parse(legacy);
          if (typeof p.startingBalance === "string") setStartingBalance(p.startingBalance);
          const incomes: Transaction[] = (p.incomes ?? []).map((i: Transaction) => ({
            ...i,
            type: "income" as const,
            recurrence: "none" as Recurrence,
          }));
          const bills: Transaction[] = (p.bills ?? []).map((b: Transaction) => ({
            ...b,
            type: "expense" as const,
            paid: false,
            recurrence: "none" as Recurrence,
          }));
          setTransactions([...incomes, ...bills]);
        }
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ startingBalance, transactions }),
      );
    } catch {
      /* ignore */
    }
  }, [hydrated, startingBalance, transactions]);

  const parsedStartingBalance = useMemo(() => {
    const val = parseFloat(startingBalance);
    return isNaN(val) ? 0 : val;
  }, [startingBalance]);

  // Split source records by type for the existing income/bills cards.
  const incomes = useMemo(
    () => transactions.filter((t) => t.type === "income"),
    [transactions],
  );
  const bills = useMemo(
    () => transactions.filter((t) => t.type === "expense"),
    [transactions],
  );

  // Long forecast window (today − 60d through today + 540d) drives the
  // chart, timeline, monthly summary, and the alert banner.
  const { occurrences, series, firstNegativeDate, endBalance } = useMemo(() => {
    const today = new Date();
    const from = addDays(today, -60);
    const to = addDays(today, 540);
    const occ = expandAll(transactions, from, to);
    const f = buildForecast(parsedStartingBalance, occ);
    return {
      occurrences: occ,
      series: f.series,
      firstNegativeDate: f.firstNegativeDate,
      endBalance: f.endBalance,
    };
  }, [transactions, parsedStartingBalance]);

  const finalBalance = occurrences.length ? endBalance : parsedStartingBalance;

  const chartData = useMemo(() => {
    if (series.length === 0) return [] as { label: string; balance: number; date: string }[];
    const points = [
      {
        label: "Start",
        balance: parsedStartingBalance,
        date: series[0].date,
      },
      ...series.map((p) => ({
        label: formatShortDate(p.date),
        balance: p.balance,
        date: p.date,
      })),
    ];
    return points;
  }, [series, parsedStartingBalance]);

  const minBalance = useMemo(
    () => (chartData.length ? Math.min(...chartData.map((d) => d.balance)) : 0),
    [chartData],
  );

  const monthlySummary = useMemo(() => {
    const map = new Map<string, { income: number; bills: number }>();
    for (const o of occurrences) {
      const key = o.occursOn.slice(0, 7);
      const cur = map.get(key) ?? { income: 0, bills: 0 };
      if (o.type === "income") cur.income += o.amount;
      else cur.bills += o.amount;
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => ({
        key,
        label: formatMonthLabel(key),
        income: v.income,
        bills: v.bills,
        net: v.income - v.bills,
      }));
  }, [occurrences]);

  const safetyThreshold = useMemo(() => {
    if (monthlySummary.length === 0) return 100;
    const avg =
      monthlySummary.reduce((s, m) => s + m.bills, 0) / monthlySummary.length;
    return computeSafetyThreshold(avg);
  }, [monthlySummary]);

  // ---------- Entry dialog (used for add and edit) ----------
  const [dialog, setDialog] = useState<EntryDialogState>(null);
  const [form, setForm] = useState({
    description: "",
    amount: "",
    date: "",
    recurrence: "none" as Recurrence,
    paid: false,
    category: "Other",
  });
  const [formError, setFormError] = useState<string | undefined>();

  function openAdd(kind: "income" | "bill", date?: string) {
    setForm({
      description: "",
      amount: "",
      date: date ?? ymd(new Date()),
      recurrence: "none",
      paid: false,
      category: "Other",
    });
    setFormError(undefined);
    setDialog({ mode: "add", kind, date: date ?? ymd(new Date()) });
  }

  function openEdit(t: Transaction) {
    setForm({
      description: t.description,
      amount: String(t.amount),
      date: t.date,
      recurrence: t.recurrence ?? "none",
      paid: t.paid ?? false,
      category: t.category ?? "Other",
    });
    setFormError(undefined);
    setDialog({
      mode: "edit",
      kind: t.type === "income" ? "income" : "bill",
      date: t.date,
      id: t.id,
    });
  }

  function saveDialog(e: React.FormEvent) {
    e.preventDefault();
    if (!dialog) return;
    if (!form.description.trim()) return setFormError("Description is required.");
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt <= 0) return setFormError("Amount must be a positive number.");
    if (!form.date) return setFormError("Date is required.");

    const base: Transaction = {
      id: dialog.id ?? generateId(),
      description: form.description.trim(),
      amount: amt,
      date: form.date,
      type: dialog.kind === "income" ? "income" : "expense",
      recurrence: form.recurrence,
      paid: dialog.kind === "bill" && form.recurrence === "none" ? form.paid : undefined,
      category: form.category,
    };

    if (dialog.mode === "add") {
      setTransactions((prev) => [...prev, base]);
    } else {
      setTransactions((prev) => prev.map((t) => (t.id === base.id ? base : t)));
    }
    setDialog(null);
  }

  function removeTransaction(id: string) {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }

  // ---------- Day detail popover (from calendar click) ----------
  const [dayDetail, setDayDetail] = useState<string | null>(null);
  const dayItems = useMemo(() => {
    if (!dayDetail) return [];
    return occurrences.filter((o) => o.occursOn === dayDetail);
  }, [dayDetail, occurrences]);

  // ---------- Statement export ----------
  function handleExportCSV() {
    const esc = (s: string | number) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const fmt = (n: number) => formatCurrency(n);
    const now = new Date();
    const generatedOn = now.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const generatedAt = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const ref =
      "BF-" +
      now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0") +
      "-" +
      Math.random().toString(36).slice(2, 6).toUpperCase();

    const totalIncome = occurrences
      .filter((o) => o.type === "income")
      .reduce((s, i) => s + i.amount, 0);
    const totalBills = occurrences
      .filter((o) => o.type === "expense")
      .reduce((s, b) => s + b.amount, 0);
    const netChange = finalBalance - parsedStartingBalance;
    const netPositive = netChange >= 0;

    const timelineRows = occurrences.length
      ? series
          .map((p, i) => {
            const o = occurrences[i];
            return `<tr>
              <td class="date">${esc(formatLongDate(o.occursOn))}</td>
              <td>${esc(o.description)}${o.isRecurringInstance ? ' <span class="badge">recurring</span>' : ""}</td>
              <td class="tag ${o.type === "income" ? "pos" : "neg"}">${o.type === "income" ? "Credit" : "Debit"}</td>
              <td class="num ${o.type === "income" ? "pos" : "neg"}">${o.signedAmount >= 0 ? "+ " : "- "}${esc(fmt(Math.abs(o.signedAmount)))}</td>
              <td class="num bal">${esc(fmt(p.balance))}</td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="5" class="empty">No projected movements.</td></tr>`;

    const monthlyRows = monthlySummary.length
      ? monthlySummary
          .map(
            (m) => `<tr>
              <td>${esc(m.label)}</td>
              <td class="num pos">${esc(fmt(m.income))}</td>
              <td class="num neg">${esc(fmt(m.bills))}</td>
              <td class="num ${m.net >= 0 ? "pos" : "neg"}">${m.net >= 0 ? "+ " : "- "}${esc(fmt(Math.abs(m.net)))}</td>
            </tr>`,
          )
          .join("")
      : `<tr><td colspan="4" class="empty">No monthly activity.</td></tr>`;

    const alertBlock = firstNegativeDate
      ? `<div class="alert">Cash flow alert · projected balance reaches zero on <strong>${esc(formatLongDate(firstNegativeDate))}</strong>.</div>`
      : "";

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>BillFlow Statement · ${esc(ref)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,500&family=Inter:wght@300;400;500;600;700&display=swap" />
<style>
  :root {
    --ink:#0f172a; --ink-soft:#475569; --muted:#94a3b8;
    --line:#e2e8f0; --line-soft:#f1f5f9; --paper:#ffffff; --paper-2:#f8fafc;
    --brand-from:#1e88e5; --brand-to:#26c6a4;
    --pos:#0f766e; --neg:#b91c1c;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#eef2f6;color:var(--ink);font-family:'Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  .sheet{max-width:920px;margin:32px auto;background:var(--paper);border:1px solid var(--line);box-shadow:0 30px 80px -40px rgba(15,23,42,0.18);position:relative;overflow:hidden;border-radius:8px}
  .topbar{height:6px;background:linear-gradient(90deg,var(--brand-from),var(--brand-to))}
  .hdr{padding:40px 56px 24px;display:flex;justify-content:space-between;align-items:flex-start;gap:32px;border-bottom:1px solid var(--line)}
  .brand{display:flex;align-items:center;gap:16px}
  .monogram{width:56px;height:56px;display:grid;place-items:center;font-family:'Inter',sans-serif;font-weight:800;font-size:30px;color:#fff;background:linear-gradient(135deg,var(--brand-from),var(--brand-to));border-radius:12px;letter-spacing:-0.02em}
  .name{font-family:'Inter',sans-serif;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:var(--ink);line-height:1}
  .tag{font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:var(--brand-from);margin-top:6px;font-weight:600}
  .meta{text-align:right;font-size:12px;color:var(--ink-soft);line-height:1.7}
  .meta strong{color:var(--ink);letter-spacing:0.04em;font-weight:600}
  .title{padding:32px 56px 8px;font-family:'Cormorant Garamond',serif;font-style:italic;font-size:28px;color:var(--ink)}
  .subtitle{padding:0 56px;color:var(--muted);font-size:13px;max-width:580px;line-height:1.6}
  .alert{margin:18px 56px 0;padding:14px 18px;background:#fef2f2;border:1px solid #fecaca;color:var(--neg);font-size:13px;border-radius:8px}
  .summary{padding:28px 56px 8px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
  .stat{border:1px solid var(--line);background:var(--paper-2);padding:16px 14px;border-radius:8px}
  .stat .lbl{font-size:9px;letter-spacing:0.26em;text-transform:uppercase;color:var(--muted);font-weight:600}
  .stat .val{margin-top:8px;font-family:'Inter',sans-serif;font-size:22px;font-weight:700;color:var(--ink);letter-spacing:-0.02em}
  .stat.brand{border-color:transparent;background:linear-gradient(135deg,rgba(30,136,229,0.08),rgba(38,198,164,0.10))}
  .stat .delta{font-size:11px;margin-top:4px;color:var(--ink-soft)}
  .stat .delta.pos{color:var(--pos)} .stat .delta.neg{color:var(--neg)}
  section{padding:24px 56px}
  h2{font-family:'Inter',sans-serif;font-weight:700;font-size:14px;letter-spacing:0.04em;color:var(--ink);margin:0 0 4px;display:flex;align-items:baseline;gap:14px;text-transform:uppercase}
  h2 .num{font-family:'Inter',sans-serif;font-size:10px;letter-spacing:0.22em;color:var(--brand-from);font-weight:600;text-transform:uppercase}
  h2::after{content:"";flex:1;height:1px;background:var(--line);margin-left:4px}
  table{width:100%;border-collapse:collapse;margin-top:14px;font-size:12.5px}
  th{text-align:left;font-weight:600;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:var(--muted);padding:10px 12px;border-bottom:1px solid var(--line)}
  td{padding:11px 12px;border-bottom:1px solid var(--line-soft);color:var(--ink);vertical-align:middle}
  tr:last-child td{border-bottom:none}
  td.date{color:var(--ink-soft);white-space:nowrap;font-variant-numeric:tabular-nums}
  td.num{text-align:right;font-variant-numeric:tabular-nums;font-weight:500}
  td.num.bal{color:var(--ink);font-weight:700}
  td.pos,.pos{color:var(--pos)} td.neg,.neg{color:var(--neg)}
  td.tag{font-size:10px;letter-spacing:0.16em;text-transform:uppercase;font-weight:600}
  td.empty{text-align:center;color:var(--muted);font-style:italic;padding:22px}
  .badge{display:inline-block;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:var(--brand-to);border:1px solid var(--brand-to);padding:2px 6px;border-radius:4px;margin-left:6px;font-weight:600}
  .footer{padding:24px 56px 36px;border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:flex-end;gap:24px;color:var(--muted);font-size:11px}
  .actions{max-width:920px;margin:0 auto 24px;display:flex;justify-content:flex-end;gap:10px;padding:0 8px}
  .actions button{font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;padding:10px 18px;border:none;background:linear-gradient(135deg,var(--brand-from),var(--brand-to));color:#fff;cursor:pointer;font-weight:700;border-radius:6px}
  @media print{body{background:#fff}.actions{display:none}.sheet{box-shadow:none;margin:0 auto;border:none;border-radius:0}}
</style>
</head>
<body>
  <div class="actions"><button onclick="window.print()">Print · Save as PDF</button></div>
  <article class="sheet">
    <div class="topbar"></div>
    <header class="hdr">
      <div class="brand">
        <svg width="56" height="56" viewBox="0 0 64 64" style="display:block;border-radius:14px;box-shadow:0 8px 24px -10px rgba(15,39,66,0.45)">
          <defs>
            <linearGradient id="bgX" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0F2742"/><stop offset="100%" stop-color="#0A1B2E"/></linearGradient>
            <linearGradient id="mkX" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#3DA9FC"/><stop offset="55%" stop-color="#26C6A4"/><stop offset="100%" stop-color="#F2C879"/></linearGradient>
          </defs>
          <rect width="64" height="64" rx="14" fill="url(#bgX)"/>
          <path d="M10 47 C 20 39, 28 55, 38 45 S 54 37, 56 41" fill="none" stroke="url(#mkX)" stroke-width="2.4" stroke-linecap="round" opacity="0.55"/>
          <path d="M20 14 H34 c6.4 0 10.4 3.2 10.4 8.2 0 3.2-1.7 5.6-4.6 6.9 3.8 1.1 6.1 3.9 6.1 7.8 0 5.7-4.5 9.1-11.6 9.1 H20 V14 z M26.2 27.5 H33.4 c2.9 0 4.6-1.3 4.6-3.5 0-2.2-1.6-3.5-4.6-3.5 H26.2 v7 z M26.2 40.3 H34.4 c3.2 0 5-1.4 5-3.8 0-2.4-1.8-3.8-5-3.8 H26.2 v7.6 z" fill="url(#mkX)"/>
          <circle cx="50" cy="18" r="2.6" fill="#F2C879"/>
        </svg>
        <div>
          <div class="name">BillFlow</div>
          <div class="tag">Calendar Cash Flow</div>
        </div>
      </div>
      <div class="meta">
        <div><strong>Statement</strong></div>
        <div>Reference · ${esc(ref)}</div>
        <div>${esc(generatedOn)}</div>
        <div>Issued at ${esc(generatedAt)}</div>
      </div>
    </header>

    <div class="title">Projected Cash-Flow Statement</div>
    <div class="subtitle">A forward-looking view of your scheduled income, bills, and projected balance over the next 18 months.</div>
    ${alertBlock}

    <div class="summary">
      <div class="stat"><div class="lbl">Opening Balance</div><div class="val">${esc(fmt(parsedStartingBalance))}</div></div>
      <div class="stat"><div class="lbl">Total Credits</div><div class="val pos">${esc(fmt(totalIncome))}</div></div>
      <div class="stat"><div class="lbl">Total Debits</div><div class="val neg">${esc(fmt(totalBills))}</div></div>
      <div class="stat brand"><div class="lbl">Projected Balance</div><div class="val">${esc(fmt(finalBalance))}</div><div class="delta ${netPositive ? "pos" : "neg"}">${netPositive ? "+" : "-"} ${esc(fmt(Math.abs(netChange)))} net</div></div>
    </div>

    <section>
      <h2>I. Projected Timeline <span class="num">${occurrences.length} movement${occurrences.length === 1 ? "" : "s"}</span></h2>
      <table>
        <thead><tr><th>Date</th><th>Description</th><th>Type</th><th style="text-align:right">Amount</th><th style="text-align:right">Running Balance</th></tr></thead>
        <tbody>${timelineRows}</tbody>
      </table>
    </section>

    <section>
      <h2>II. Monthly Summary</h2>
      <table>
        <thead><tr><th>Month</th><th style="text-align:right">Income</th><th style="text-align:right">Bills</th><th style="text-align:right">Net</th></tr></thead>
        <tbody>${monthlyRows}</tbody>
      </table>
    </section>

    <footer class="footer">
      <div>BillFlow · Prepared for the account holder.</div>
      <div>Generated ${esc(generatedOn)}</div>
    </footer>
  </article>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = now.toISOString().slice(0, 10);
    link.href = url;
    link.download = `billflow-statement-${today}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const hasAnyData =
    transactions.length > 0 || startingBalance !== "";

  return (
    <div className="relative min-h-screen py-10 px-4 sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-[var(--brand-from)]/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full bg-[var(--brand-to)]/15 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl space-y-8">
        {/* Header */}
        <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <BrandLogo size={56} />
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-foreground/80 shadow-sm">
                <CalendarDays className="h-3 w-3 text-[var(--brand-to)]" />
                Calendar Cash Flow
              </div>
              <h1 className="mt-1.5 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
                <span className="brand-text">BillFlow</span>
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                See what your money will look like, week by week.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <Button
              onClick={handleExportCSV}
              disabled={!hasAnyData}
              className="hidden sm:inline-flex h-10 items-center rounded-full border-0 px-5 text-sm font-semibold text-white shadow-[var(--shadow-gold)] transition-transform hover:scale-[1.02] disabled:opacity-50"
              style={{ background: "var(--gradient-gold)" }}
            >
              <Download className="h-4 w-4 mr-1.5" />
              Export Statement
            </Button>
          </div>
        </header>

        <div className="hairline" />

        {/* Forecast alert */}
        {firstNegativeDate && (
          <div className="flex items-start gap-3 rounded-2xl border border-expense/40 bg-expense-muted/40 px-4 py-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-expense" />
            <div>
              <p className="font-medium text-expense">
                Projected to reach $0 on {formatLongDate(firstNegativeDate)}.
              </p>
              <p className="text-xs text-muted-foreground">
                Review upcoming bills or add expected income to avoid the shortfall.
              </p>
            </div>
          </div>
        )}

        {/* Starting Balance + Final */}
        <div className="grid gap-5 md:grid-cols-3">
          <Card className="glass-card md:col-span-2 overflow-hidden rounded-2xl">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Starting Balance
                </span>
                <Wallet className="h-4 w-4 text-[var(--brand-to)]" />
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="font-display text-5xl font-medium tracking-tight brand-text sm:text-6xl">
                {formatCurrency(parsedStartingBalance)}
              </div>
              <div>
                <Label htmlFor="starting-balance" className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Adjust opening figure
                </Label>
                <Input
                  id="starting-balance"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={startingBalance}
                  onChange={(e) => setStartingBalance(e.target.value)}
                  className="mt-2 h-11 border-[var(--brand-to)]/25 bg-background/40 text-lg focus-visible:ring-[var(--brand-to)]/40"
                />
              </div>
            </CardContent>
          </Card>

          <Card
            className={`glass-card overflow-hidden rounded-2xl ${
              finalBalance < 0 ? "ring-1 ring-expense/40" : "ring-1 ring-[var(--brand-to)]/25"
            }`}
          >
            <CardHeader className="pb-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                Projected · 18 mo
              </span>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                className={`font-display text-4xl font-medium tracking-tight ${
                  finalBalance < 0 ? "text-expense" : "brand-text"
                }`}
              >
                {formatCurrency(finalBalance)}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="h-1 w-1 rounded-full bg-[var(--brand-to)]" />
                  {occurrences.length} movement{occurrences.length === 1 ? "" : "s"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-1 w-1 rounded-full bg-[var(--brand-to)]" />
                  {monthlySummary.length} month{monthlySummary.length === 1 ? "" : "s"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Calendar */}
        <Card className="glass-card rounded-2xl">
          <CardContent className="pt-6">
            <CalendarView
              month={calendarMonth}
              onChangeMonth={setCalendarMonth}
              transactions={transactions}
              startingBalance={parsedStartingBalance}
              safetyThreshold={safetyThreshold}
              onDayClick={(d) => setDayDetail(d)}
            />
          </CardContent>
        </Card>

        {/* Income & Bills source lists */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="glass-card rounded-2xl">
            <CardHeader className="flex-row items-center justify-between pb-4">
              <div>
                <CardTitle className="flex items-center gap-2 font-display text-2xl font-medium text-income">
                  <TrendingUp className="h-5 w-5" />
                  Income
                </CardTitle>
                <CardDescription>Paychecks and other earnings.</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => openAdd("income")}>
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </CardHeader>
            <CardContent>
              {incomes.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No income added yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {incomes.map((inc) => (
                    <SourceRow
                      key={inc.id}
                      t={inc}
                      tone="income"
                      onEdit={() => openEdit(inc)}
                      onRemove={() => removeTransaction(inc.id)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card rounded-2xl">
            <CardHeader className="flex-row items-center justify-between pb-4">
              <div>
                <CardTitle className="flex items-center gap-2 font-display text-2xl font-medium text-expense">
                  <TrendingDown className="h-5 w-5" />
                  Bills
                </CardTitle>
                <CardDescription>Rent, subscriptions, and other obligations.</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => openAdd("bill")}>
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </CardHeader>
            <CardContent>
              {bills.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No bills added yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {bills.map((b) => (
                    <SourceRow
                      key={b.id}
                      t={b}
                      tone="expense"
                      onEdit={() => openEdit(b)}
                      onRemove={() => removeTransaction(b.id)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Chart */}
        <Card className="glass-card rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-2xl font-medium">Balance Over Time</CardTitle>
            <CardDescription>Projected running balance across the next 18 months.</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Add income or bills to see the chart.
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--brand-to)" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="var(--brand-to)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis
                      stroke="var(--muted-foreground)"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) =>
                        new Intl.NumberFormat("en-US", {
                          notation: "compact",
                          style: "currency",
                          currency: "USD",
                          maximumFractionDigits: 1,
                        }).format(v as number)
                      }
                      width={70}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        color: "var(--popover-foreground)",
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [formatCurrency(value), "Balance"]}
                    />
                    {minBalance < 0 && <ReferenceLine y={0} stroke="var(--expense)" strokeDasharray="4 4" />}
                    <Area type="monotone" dataKey="balance" stroke="var(--brand-to)" strokeWidth={2.5} fill="url(#balanceFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Summary */}
        <Card className="glass-card rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 font-display text-2xl font-medium">
              <CalendarDays className="h-5 w-5 text-[var(--brand-to)]" />
              Monthly Summary
            </CardTitle>
            <CardDescription>Income, bills, and net per month.</CardDescription>
          </CardHeader>
          <CardContent>
            {monthlySummary.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                Add entries to see monthly totals.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6 px-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Income</TableHead>
                      <TableHead className="text-right">Bills</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlySummary.map((m) => (
                      <TableRow key={m.key}>
                        <TableCell className="font-medium">{m.label}</TableCell>
                        <TableCell className="text-right text-income font-medium">{formatCurrency(m.income)}</TableCell>
                        <TableCell className="text-right text-expense font-medium">{formatCurrency(m.bills)}</TableCell>
                        <TableCell className={`text-right font-bold ${m.net < 0 ? "text-expense" : "text-income"}`}>
                          {formatCurrency(m.net)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="sm:hidden">
          <Button
            onClick={handleExportCSV}
            disabled={!hasAnyData}
            className="w-full justify-center rounded-full border-0 h-11 text-sm font-semibold text-white shadow-[var(--shadow-gold)] disabled:opacity-50"
            style={{ background: "var(--gradient-gold)" }}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Export Statement
          </Button>
        </div>
      </div>

      {/* Day-detail dialog (from calendar click) */}
      <Dialog open={dayDetail !== null} onOpenChange={(o) => !o && setDayDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <BrandLogo size={36} />
              <div className="min-w-0">
                <DialogTitle className="font-display text-xl font-semibold">
                  {dayDetail && formatLongDate(dayDetail)}
                </DialogTitle>
                <DialogDescription>
                  {dayItems.length === 0
                    ? "Nothing scheduled. Add income or a bill for this day."
                    : `${dayItems.length} item${dayItems.length === 1 ? "" : "s"} scheduled.`}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {dayItems.length > 0 && (
            <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
              {dayItems.map((o) => {
                const parent = transactions.find((t) => t.id === o.parentId);
                if (!parent) return null;
                return (
                  <div
                    key={o.parentId + o.occursOn}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                      o.type === "income" ? "bg-income-muted/40" : "bg-expense-muted/40"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{o.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {o.isRecurringInstance ? "Recurring · " : ""}
                        {o.type === "income" ? "Income" : "Bill"}
                        {o.category ? ` · ${o.category}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-sm font-semibold ${o.type === "income" ? "text-income" : "text-expense"}`}>
                        {o.type === "income" ? "+" : "-"}
                        {formatCurrency(o.amount)}
                      </span>
                      <button
                        onClick={() => {
                          setDayDetail(null);
                          openEdit(parent);
                        }}
                        className="rounded-md p-1 text-muted-foreground hover:text-primary"
                        aria-label="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const d = dayDetail;
                setDayDetail(null);
                openAdd("income", d ?? undefined);
              }}
              className="border-income text-income hover:bg-income-muted hover:text-income"
            >
              <Plus className="mr-1 h-4 w-4" />
              Add income
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const d = dayDetail;
                setDayDetail(null);
                openAdd("bill", d ?? undefined);
              }}
              className="border-expense text-expense hover:bg-expense-muted hover:text-expense"
            >
              <Plus className="mr-1 h-4 w-4" />
              Add bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Entry add/edit dialog */}
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <BrandLogo size={36} />
              <div className="min-w-0">
                <DialogTitle className="font-display text-xl font-semibold capitalize">
                  {dialog?.mode === "edit" ? "Edit" : "Add"}{" "}
                  {dialog?.kind === "income" ? "income" : "bill"}
                </DialogTitle>
                <DialogDescription>
                  {dialog?.kind === "income"
                    ? "When do you expect this money to arrive?"
                    : "When is this bill due?"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <form onSubmit={saveDialog} className="space-y-4">
            <div>
              <Label htmlFor="d-desc" className="text-xs font-medium">Description</Label>
              <Input
                id="d-desc"
                placeholder={dialog?.kind === "income" ? "e.g. Paycheck" : "e.g. Rent"}
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="d-amount" className="text-xs font-medium">Amount</Label>
                <Input
                  id="d-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="d-date" className="text-xs font-medium">Date</Label>
                <Input
                  id="d-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium">Repeats</Label>
                <Select
                  value={form.recurrence}
                  onValueChange={(v) => setForm((p) => ({ ...p, recurrence: v as Recurrence }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">One time</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-medium">Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(dialog?.kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(
                      (c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {dialog?.kind === "bill" && form.recurrence === "none" && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.paid}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, paid: v === true }))}
                />
                Mark as paid
              </label>
            )}
            {formError && <p className="text-sm text-expense">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button type="submit">
                {dialog?.mode === "edit" ? "Save changes" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SourceRow({
  t,
  tone,
  onEdit,
  onRemove,
}: {
  t: Transaction;
  tone: "income" | "expense";
  onEdit: () => void;
  onRemove: () => void;
}) {
  const recurring = t.recurrence && t.recurrence !== "none";
  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
        tone === "income" ? "bg-income-muted/40" : "bg-expense-muted/40"
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{t.description}</p>
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {formatLongDate(t.date)}
          {t.category && (
            <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-foreground/80">
              {t.category}
            </span>
          )}
          {recurring && (
            <span className="inline-flex items-center gap-1 rounded border border-[var(--brand-to)]/40 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--brand-to)]">
              <Repeat className="h-2.5 w-2.5" />
              {t.recurrence}
            </span>
          )}
          {tone === "expense" && t.paid && !recurring && (
            <span className="rounded border border-income/40 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-income">
              Paid
            </span>
          )}
        </p>
      </div>
      <div className="ml-2 flex shrink-0 items-center gap-2">
        <span className={`text-sm font-semibold ${tone === "income" ? "text-income" : "text-expense"}`}>
          {formatCurrency(t.amount)}
        </span>
        <button
          onClick={onEdit}
          className="rounded-md p-1 text-muted-foreground hover:text-primary"
          aria-label="Edit"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={onRemove}
          className="rounded-md p-1 text-muted-foreground hover:text-expense"
          aria-label="Remove"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default BillFlowApp;
