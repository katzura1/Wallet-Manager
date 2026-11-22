import { Check, ChevronRight } from "lucide-react";
import { IconTile, Sheet } from "@/components/ui";
import { cn, formatCurrency, formatNumberWithSeparator } from "@/lib/utils";
import type { Account } from "@/types";
import { rowCls, rowLabelCls } from "./formStyles";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]";

/** Big centered "Rp" amount input (same look as the transaction form). */
export function AmountHero({ label, ariaLabel, value, onChange, autoFocus, error, hint, inputRef }: {
  label?: string;
  ariaLabel: string;
  value: string;
  onChange: (digits: string) => void;
  autoFocus?: boolean;
  error?: string;
  hint?: React.ReactNode;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const text = formatNumberWithSeparator(value);
  return (
    <div>
      <label className="flex cursor-text flex-col items-center gap-1 py-2">
        {label && <span className="text-[13px] font-medium text-[hsl(var(--muted-foreground))]">{label}</span>}
        <span className="flex max-w-full items-baseline justify-center gap-2">
          <span aria-hidden="true" className="text-2xl font-bold text-[hsl(var(--muted-foreground))]">Rp</span>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            aria-label={ariaLabel}
            data-autofocus={autoFocus || undefined}
            placeholder="0"
            value={text}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
            style={{ width: `${Math.max(text.length, 1) + 0.5}ch` }}
            className="min-w-[1.5ch] max-w-full bg-transparent p-0 text-[40px] font-extrabold leading-tight tracking-tight tabular-nums placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none"
          />
        </span>
        {hint && <span className="text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{hint}</span>}
      </label>
      {error && <p role="alert" className="mt-1 text-center text-sm text-danger">{error}</p>}
    </div>
  );
}

export function RowsCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("divide-y divide-[hsl(var(--border))] overflow-hidden rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]", className)}>{children}</section>;
}

/** Label on the left, control on the right. */
export function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={cn(rowCls, "cursor-text")}>
      <span className={rowLabelCls}>{label}</span>
      {children}
    </label>
  );
}

/** Row that opens a picker. */
export function PickerRow({ label, value, onClick, ariaLabel, muted }: { label: string; value: string; onClick: () => void; ariaLabel?: string; muted?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className={cn(rowCls, "w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]")}>
      <span className={rowLabelCls}>{label}</span>
      <span className={cn("min-w-0 flex-1 truncate text-right text-sm font-semibold", muted && "font-normal text-[hsl(var(--muted-foreground))]")}>{value}</span>
      <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-[hsl(var(--muted-foreground))]" />
    </button>
  );
}

export function NoteLine({ children }: { children: React.ReactNode }) {
  return <p className="px-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{children}</p>;
}

/** Primary CTA for the Modal footer; submits the form with the given id. */
export function SubmitButton({ form, disabled, children }: { form: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" form={form} disabled={disabled} className={cn("h-[54px] w-full rounded-2xl bg-[hsl(var(--primary))] text-base font-bold text-[hsl(var(--primary-foreground))] shadow-sm hover:brightness-[1.06] disabled:opacity-50", focusRing)}>
      {children}
    </button>
  );
}

/** Account chooser sheet with IconTile rows. */
export function AccountPickerSheet({ open, onClose, title, accounts, selectedId, onPick, hidden, currency, noneLabel }: {
  open: boolean;
  onClose: () => void;
  title: string;
  accounts: Account[];
  selectedId: string;
  onPick: (id: string) => void;
  hidden: boolean;
  currency: string;
  /** When set, adds a first row that clears the choice. */
  noneLabel?: string;
}) {
  const money = (value: number) => (hidden ? "•••" : formatCurrency(value, currency));
  const rowBtn = "flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]";
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="divide-y divide-[hsl(var(--border))] overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        {noneLabel && (
          <button type="button" aria-current={selectedId === "" ? "true" : undefined} onClick={() => onPick("")} className={rowBtn}>
            <span className="min-w-0 flex-1 text-[15px] font-semibold">{noneLabel}</span>
            {selectedId === "" && <Check size={18} aria-hidden="true" className="shrink-0 text-[hsl(var(--primary))]" />}
          </button>
        )}
        {accounts.length === 0 && <p className="p-4 text-center text-sm text-[hsl(var(--muted-foreground))]">Belum ada akun.</p>}
        {accounts.map((a) => {
          const selected = String(a.id) === selectedId;
          return (
            <button key={a.id} type="button" aria-current={selected ? "true" : undefined} onClick={() => onPick(String(a.id))} className={rowBtn}>
              <IconTile label={a.name} color={a.color} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{a.name}</span>
                <span className="block text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{money(a.currentBalance)}</span>
              </span>
              {selected && <Check size={18} aria-hidden="true" className="shrink-0 text-[hsl(var(--primary))]" />}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
