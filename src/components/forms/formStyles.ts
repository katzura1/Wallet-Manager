export const rowCls = "flex min-h-[52px] items-center gap-3 px-4 text-left";
export const rowLabelCls = "shrink-0 text-sm text-[hsl(var(--muted-foreground))]";

export const dateInputCls = "min-h-11 min-w-0 flex-1 bg-transparent text-right text-sm font-semibold focus:outline-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-date-and-time-value]:text-right";
export const textInputCls = "min-h-11 min-w-0 flex-1 bg-transparent text-right text-sm font-semibold placeholder:font-normal placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none";

export function openDatePicker(e: React.MouseEvent<HTMLInputElement>) {
  try { e.currentTarget.showPicker?.(); } catch { /* picker needs a user gesture */ }
}

