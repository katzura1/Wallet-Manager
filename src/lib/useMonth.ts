import { useState } from "react";
import { useSearchParams } from "react-router-dom";

function parseMonth(value: string | null): { year: number; month: number } | null {
  const match = value?.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
}

/**
 * Selected year/month state with previous/next stepping, shared by Reports and Budgets.
 * Seeds from the `month` search param when present; with `syncParam` it keeps the param in sync (replace).
 */
export function useMonth({ syncParam = false }: { syncParam?: boolean } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [now] = useState(() => new Date());
  const [initial] = useState(() => parseMonth(searchParams.get("month")));
  const [year, setYear] = useState(initial?.year ?? now.getFullYear());
  const [month, setMonth] = useState(initial?.month ?? now.getMonth() + 1);

  function go(y: number, m: number) {
    setYear(y);
    setMonth(m);
    if (syncParam) {
      const next = new URLSearchParams(searchParams);
      next.set("month", `${y}-${String(m).padStart(2, "0")}`);
      setSearchParams(next, { replace: true });
    }
  }
  function prev() {
    if (month === 1) go(year - 1, 12); else go(year, month - 1);
  }
  function next() {
    if (month === 12) go(year + 1, 1); else go(year, month + 1);
  }

  const key = `${year}-${String(month).padStart(2, "0")}`;
  const date = new Date(year, month - 1, 1);
  return {
    year,
    month,
    key,
    prev,
    next,
    label: date.toLocaleString("id-ID", { month: "long", year: "numeric" }),
    shortLabel: date.toLocaleString("id-ID", { month: "short", year: "numeric" }),
    monthName: date.toLocaleString("id-ID", { month: "long" }),
  };
}
