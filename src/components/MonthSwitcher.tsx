import { ChevronLeft, ChevronRight } from "lucide-react";

const stepButton = "flex h-11 w-11 items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]";

export function MonthSwitcher({ label, shortLabel, onPrev, onNext }: { label: string; shortLabel: string; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" aria-label="Bulan sebelumnya" onClick={onPrev} className={stepButton}><ChevronLeft size={16} /></button>
      <p className="px-1.5 text-center text-sm font-bold capitalize lg:min-w-[120px]">
        <span className="lg:hidden">{shortLabel}</span>
        <span className="hidden lg:inline">{label}</span>
      </p>
      <button type="button" aria-label="Bulan berikutnya" onClick={onNext} className={stepButton}><ChevronRight size={16} /></button>
    </div>
  );
}
