import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type Occurrence,
  type Transaction,
  addDays,
  buildForecast,
  dayRiskLevel,
  expandAll,
  formatCurrency,
  formatCurrencyCompact,
  parseYmd,
  ymd,
} from "@/lib/billflow";

interface Props {
  month: Date; // any date in the visible month
  onChangeMonth: (next: Date) => void;
  transactions: Transaction[];
  startingBalance: number;
  safetyThreshold: number;
  onDayClick: (date: string, dayOccurrences: Occurrence[]) => void;
}

export function CalendarView({
  month,
  onChangeMonth,
  transactions,
  startingBalance,
  safetyThreshold,
  onDayClick,
}: Props) {
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const lastOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0);

  // Grid spans the Sunday before the 1st through the Saturday after the last.
  const gridStart = addDays(firstOfMonth, -firstOfMonth.getDay());
  const gridEnd = addDays(lastOfMonth, 6 - lastOfMonth.getDay());

  // Forecast across a wide window so the running balance at each visible day
  // accounts for everything that happens before it, even outside this month.
  const { occByDay, balanceByDay } = useMemo(() => {
    const minDate = transactions.length
      ? transactions.reduce(
          (min, t) => (t.date < min ? t.date : min),
          transactions[0].date,
        )
      : ymd(gridStart);
    const windowStart = parseYmd(minDate) < gridStart ? parseYmd(minDate) : gridStart;
    const windowEnd = addDays(gridEnd, 1);
    const occ = expandAll(transactions, windowStart, windowEnd);
    const { series } = buildForecast(startingBalance, occ);

    const occByDay = new Map<string, Occurrence[]>();
    for (const o of occ) {
      const arr = occByDay.get(o.occursOn) ?? [];
      arr.push(o);
      occByDay.set(o.occursOn, arr);
    }

    // Map each date to the *end-of-day* balance. Days with no activity
    // inherit the most recent prior balance, starting from startingBalance.
    const balanceByDay = new Map<string, number>();
    let cursor = new Date(windowStart);
    let lastBalance = startingBalance;
    let idx = 0;
    while (cursor <= windowEnd) {
      const key = ymd(cursor);
      // Apply any series points dated on or before this day that we haven't consumed.
      while (idx < series.length && series[idx].date <= key) {
        lastBalance = series[idx].balance;
        idx += 1;
      }
      balanceByDay.set(key, lastBalance);
      cursor = addDays(cursor, 1);
    }
    return { occByDay, balanceByDay };
  }, [transactions, startingBalance, gridStart, gridEnd]);

  const days: Date[] = [];
  for (let d = new Date(gridStart); d <= gridEnd; d = addDays(d, 1)) {
    days.push(new Date(d));
  }

  const monthLabel = firstOfMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const todayStr = ymd(new Date());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl font-medium tracking-tight">
            <span className="brand-text">{monthLabel.split(" ")[0]}</span>{" "}
            <span className="text-muted-foreground">{monthLabel.split(" ")[1]}</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tap any day to add income or a bill.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onChangeMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
            className="h-9 w-9 p-0"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChangeMonth(new Date())}
            className="h-9 px-3 text-xs uppercase tracking-[0.18em]"
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onChangeMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
            className="h-9 w-9 p-0"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Safe
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500" /> Watch
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-500" /> Risk
        </span>
      </div>

      <div className="grid grid-cols-7 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-2 py-2 text-center">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-border bg-border">
        {days.map((d) => {
          const key = ymd(d);
          const inMonth = d.getMonth() === month.getMonth();
          const isToday = key === todayStr;
          const dayOcc = occByDay.get(key) ?? [];
          const bal = balanceByDay.get(key);
          const risk = inMonth ? dayRiskLevel(bal, safetyThreshold) : "neutral";
          const isNeg = risk === "danger";

          const circleClass = isToday
            ? "bg-gradient-to-br from-[var(--brand-from)] to-[var(--brand-to)] text-white shadow ring-2 ring-offset-1 ring-offset-card " +
              (risk === "danger"
                ? "ring-rose-500"
                : risk === "watch"
                  ? "ring-amber-500"
                  : risk === "safe"
                    ? "ring-emerald-500"
                    : "ring-transparent")
            : inMonth
              ? risk === "danger"
                ? "bg-rose-500/15 text-rose-600 ring-1 ring-inset ring-rose-500/40"
                : risk === "watch"
                  ? "bg-amber-400/15 text-amber-700 ring-1 ring-inset ring-amber-500/40"
                  : risk === "safe"
                    ? "bg-emerald-500/15 text-emerald-700 ring-1 ring-inset ring-emerald-500/40"
                    : "text-foreground"
              : "text-muted-foreground/60";

          return (
            <button
              key={key}
              type="button"
              onClick={() => onDayClick(key, dayOcc)}
              className={[
                "group relative flex min-h-[88px] flex-col gap-1 p-1.5 text-left transition-colors sm:min-h-[112px] sm:p-2",
                inMonth ? "bg-card" : "bg-card/30 text-muted-foreground",
                "hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isNeg ? "ring-1 ring-inset ring-rose-500/30" : "",
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <span
                  className={[
                    "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                    circleClass,
                  ].join(" ")}
                >
                  {d.getDate()}
                </span>
                {dayOcc.length > 0 && (
                  <span className="text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    {dayOcc.length}
                  </span>
                )}
              </div>

              <div className="flex-1 space-y-0.5 overflow-hidden">
                {dayOcc.slice(0, 3).map((o) => (
                  <div
                    key={o.parentId + o.occursOn}
                    className={[
                      "truncate rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight",
                      o.type === "income"
                        ? "bg-income-muted text-income"
                        : "bg-expense-muted text-expense",
                      o.paid ? "opacity-60 line-through" : "",
                    ].join(" ")}
                    title={`${o.description}${o.category ? " · " + o.category : ""} · ${formatCurrency(o.amount)}`}
                  >
                    {o.paid && <Check className="mr-0.5 inline h-2.5 w-2.5" />}
                    {o.type === "income" ? "+" : "-"}
                    {formatCurrencyCompact(o.amount)}{" "}
                    <span className="opacity-80">{o.description}</span>
                  </div>
                ))}
                {dayOcc.length > 3 && (
                  <div className="text-[10px] text-muted-foreground">
                    +{dayOcc.length - 3} more
                  </div>
                )}
              </div>

              {bal !== undefined && inMonth && (
                <div
                  className={[
                    "mt-auto text-[9px] font-medium uppercase tracking-[0.14em]",
                    isNeg ? "text-rose-600" : "text-muted-foreground",
                  ].join(" ")}
                >
                  {formatCurrencyCompact(bal)}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
