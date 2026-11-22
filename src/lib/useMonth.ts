import { useState } from "react";

/** Selected year/month state with previous/next stepping, shared by Reports and Budgets. */
export function useMonth() {
  const [now] = useState(() => new Date());
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  function prev() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); } else setMonth((m) => m - 1);
  }
  function next() {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); } else setMonth((m) => m + 1);
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
