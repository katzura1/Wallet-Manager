import { cn } from "@/lib/utils";
import * as React from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pb-2", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold tracking-tight text-[hsl(var(--foreground))]", className)} {...props} />;
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "destructive" | "success";
  size?: "sm" | "md" | "lg" | "icon";
}

export function Button({ className, variant = "default", size = "md", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background))]",
        {
          "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm hover:brightness-[1.06]": variant === "default",
          "border border-[hsl(var(--border))] bg-[hsl(var(--card))]/80 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]": variant === "outline",
          "bg-transparent text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]": variant === "ghost",
          "bg-red-500 text-white hover:bg-red-600": variant === "destructive",
          "bg-emerald-500 text-white hover:bg-emerald-600": variant === "success",
          "text-xs px-3.5 py-1.5 h-9": size === "sm",
          "text-sm px-4 py-2.5 h-11": size === "md",
          "text-sm px-6 py-3 h-12": size === "lg",
          "w-10 h-10 p-0": size === "icon",
        },
        className,
      )}
      {...props}
    />
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div className="space-y-1">
          {label && <label className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</label>}
      <input
        className={cn(
          "w-full rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/75 px-4 py-3 text-base placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]",
          error && "border-red-500",
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export function Select({ label, error, className, children, ...props }: SelectProps) {
  return (
    <div className="space-y-1">
          {label && <label className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</label>}
      <select
        className={cn(
          "w-full rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/75 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]",
          error && "border-red-500",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function Textarea({ label, className, ...props }: TextareaProps) {
  return (
    <div className="space-y-1">
          {label && <label className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</label>}
      <textarea
        className={cn(
          "w-full rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/75 px-4 py-3 text-base placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] resize-none",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex items-center rounded-full border border-transparent px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em]", className)} {...props} />;
}

// Simple Modal
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  noScroll?: boolean;
}

let lockCount = 0;
let lockedOverflow = "";
function lockScroll() {
  if (lockCount === 0) {
    lockedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
}
function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) document.body.style.overflow = lockedOverflow;
}

const overlayStack: object[] = [];
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Shared by Sheet and Modal: scroll lock, initial focus, Escape, Tab trap, focus restore. */
function useOverlayBehavior(open: boolean, onClose: () => void, panelRef: React.RefObject<HTMLElement | null>, closeRef: React.RefObject<HTMLElement | null>) {
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => { onCloseRef.current = onClose; });
  React.useEffect(() => {
    if (!open) return;
    const token = {};
    overlayStack.push(token);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    lockScroll();
    closeRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (overlayStack[overlayStack.length - 1] !== token) return;
      if (document.querySelector('[role="alertdialog"]')) return;
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!panelRef.current?.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      const index = overlayStack.indexOf(token);
      if (index >= 0) overlayStack.splice(index, 1);
      unlockScroll();
      previouslyFocused?.focus?.();
    };
  }, [open, panelRef, closeRef]);
}

function GrabHandle() {
  return <div aria-hidden="true" className="flex justify-center pt-2.5 lg:hidden"><span className="h-1 w-10 rounded-full bg-[hsl(var(--surface-3))]" /></div>;
}

export function Modal({ open, onClose, title, children, noScroll }: ModalProps) {
  const titleId = React.useId();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  useOverlayBehavior(open, onClose, panelRef, closeRef);

  if (!open) return null;
  // Rendered into document.body so no ancestor stacking context can place the bottom nav above it.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center lg:items-center lg:p-4" data-modal-open="true">
      <div className="absolute inset-0 bg-black/45" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        className={cn(
          "relative z-10 flex w-full flex-col overflow-hidden rounded-t-3xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-2xl overscroll-contain lg:max-w-lg lg:rounded-3xl",
          noScroll ? "h-[90dvh] lg:h-auto lg:max-h-[90dvh]" : "max-h-[90dvh]",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <GrabHandle />
        <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-5 pb-3 pt-2 lg:pt-4">
          <h2 id={titleId} className="min-w-0 truncate text-lg font-semibold leading-tight">{title}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Tutup dialog" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className={noScroll ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "min-h-0 overflow-y-auto p-5 safe-bottom"}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger";
  onConfirm: () => unknown;
  onClose: () => void;
}

export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = "Batal", tone = "danger", onConfirm, onClose }: ConfirmDialogProps) {
  const titleId = React.useId();
  const descId = React.useId();
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLElement>(null);
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => { onCloseRef.current = onClose; });

  React.useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    lockScroll();
    cancelRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { onCloseRef.current(); return; }
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      unlockScroll();
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  const danger = tone === "danger";
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/45" aria-hidden="true" onClick={onClose} />
      <section
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative z-10 flex w-full max-w-sm flex-col gap-3 rounded-3xl bg-[hsl(var(--card))] px-5 pb-5 pt-6 shadow-2xl"
      >
        <span aria-hidden="true" className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", danger && "bg-danger/10 text-danger")}>
          <Trash2 size={22} />
        </span>
        <h2 id={titleId} className="text-lg font-extrabold leading-tight text-[hsl(var(--foreground))]">{title}</h2>
        <p id={descId} className="break-words text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{description}</p>
        <div className="mt-1.5 grid grid-cols-2 gap-2.5">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            className="h-12 rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[15px] font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => { void onConfirm(); }}
            className="h-12 rounded-[14px] bg-danger text-[15px] font-bold text-[hsl(var(--primary-foreground))] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

const tileSizes = {
  sm: "h-8 w-8 rounded-[10px] text-[11px]",
  md: "h-10 w-10 rounded-xl text-sm",
  lg: "h-12 w-12 rounded-2xl text-base",
} as const;

function initialsOf(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const letters = (w: string) => Array.from(w.replace(/[^\p{L}\p{N}]/gu, ""));
  if (words.length === 0) return "?";
  if (words.length === 1) return letters(words[0]).slice(0, 2).join("").toUpperCase() || "?";
  const first = letters(words[0])[0] ?? "";
  const second = letters(words[1])[0] ?? "";
  return (first + second).toUpperCase() || "?";
}

function validColor(color?: string): string | undefined {
  if (!color) return undefined;
  return typeof CSS !== "undefined" && CSS.supports?.("color", color) ? color : undefined;
}

export function IconTile({ label, color, size = "md", className }: { label: string; color?: string; size?: keyof typeof tileSizes; className?: string }) {
  const tint = validColor(color) ?? "hsl(var(--primary))";
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 select-none items-center justify-center font-bold leading-none", tileSizes[size], className)}
      style={{ background: `color-mix(in srgb, ${tint} 14%, transparent)`, color: `color-mix(in srgb, ${tint} 70%, hsl(var(--foreground)))` }}
    >
      {initialsOf(label)}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="w-7 h-7 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function EmptyState({ icon, title, description }: { icon: string; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))]/55 px-5 py-12 text-center gap-3">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--surface-2))] text-3xl">{icon}</span>
      <div className="space-y-1.5">
        <p className="font-semibold text-[hsl(var(--foreground))]">{title}</p>
        {description && <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-xs">{description}</p>}
      </div>
    </div>
  );
}

export function PageHeader({ title, back, actions }: { title: string; back?: string; actions?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {back && (
          <Link
            to={back}
            aria-label="Kembali"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--surface-2))] text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          >
            <ChevronLeft size={20} />
          </Link>
        )}
        <h1 className="truncate text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">{title}</h1>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}

export function SegmentedControl<T extends string>({ label, value, options, onChange }: SegmentedControlProps<T>) {
  const tabRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    const last = options.length - 1;
    let next: number;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else return;
    event.preventDefault();
    onChange(options[next].value);
    tabRefs.current[next]?.focus();
  }
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 rounded-xl bg-[hsl(var(--surface-2))] p-1">
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => { tabRefs.current[i] = el; }}
          tabIndex={o.value === value ? 0 : -1}
          onKeyDown={(e) => handleKeyDown(e, i)}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-11 flex-1 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
            o.value === value
              ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm"
              : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "group flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        disabled && "opacity-50",
      )}
    >
      <span className={cn("relative h-7 w-12 rounded-full transition-colors", checked ? "bg-[hsl(var(--primary))]" : "bg-[hsl(var(--surface-3))]")}>
        <span className={cn("absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-[hsl(var(--card))] shadow transition-transform", checked && "translate-x-5")} />
      </span>
    </button>
  );
}

const progressTones = {
  primary: "bg-[hsl(var(--primary))]",
  warning: "bg-warning",
  danger: "bg-danger",
  success: "bg-success",
} as const;

export function ProgressBar({ value, max, tone = "primary", label }: { value: number; max: number; tone?: keyof typeof progressTones; label: string }) {
  const percent = max <= 0 ? 0 : Math.min(100, Math.max(0, Math.round((value / max) * 100)));
  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-2 w-full overflow-hidden rounded-full bg-[hsl(var(--surface-3))]"
    >
      <div className={cn("h-full rounded-full transition-[width]", progressTones[tone])} style={{ width: `${percent}%` }} />
    </div>
  );
}

export function ListGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      {title && <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">{title}</h2>}
      <div className="divide-y divide-[hsl(var(--border))] overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">{children}</div>
    </section>
  );
}

interface ListRowProps {
  label: string;
  sub?: string;
  value?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  tone?: "default" | "danger";
}

export function ListRow({ label, sub, value, href, onClick, tone = "default" }: ListRowProps) {
  const interactive = Boolean(href || onClick);
  const cls = cn(
    "flex min-h-[46px] w-full items-center gap-3 px-4 py-2.5 text-left",
    interactive && "hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]",
  );
  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm font-medium", tone === "danger" ? "text-danger" : "text-[hsl(var(--foreground))]")}>{label}</span>
        {sub && <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{sub}</span>}
      </span>
      {value !== undefined && <span className="shrink-0 text-sm text-[hsl(var(--muted-foreground))]">{value}</span>}
      {interactive && <ChevronRight size={16} className="shrink-0 text-[hsl(var(--muted-foreground))]" />}
    </>
  );
  if (href) return <Link to={href} className={cls}>{content}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{content}</button>;
  return <div className={cls}>{content}</div>;
}

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Sheet({ open, onClose, title, children }: SheetProps) {
  const titleId = React.useId();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  useOverlayBehavior(open, onClose, panelRef, closeRef);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center lg:items-center lg:p-4">
      <div className="absolute inset-0 bg-black/45" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-2xl lg:max-w-lg lg:rounded-3xl"
      >
        <GrabHandle />
        <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-5 pb-3 pt-2 lg:pt-4">
          <h2 id={titleId} className="min-w-0 truncate text-lg font-semibold leading-tight">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-5 safe-bottom">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
