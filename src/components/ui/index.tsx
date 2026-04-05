import { cn } from "@/lib/utils";
import * as React from "react";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[28px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]/96 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.45)] backdrop-blur-sm", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pb-2", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]", className)} {...props} />;
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "destructive" | "success";
  size?: "sm" | "md" | "lg" | "icon";
}

export function Button({ className, variant = "default", size = "md", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl font-medium transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background))]",
        {
          "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_12px_24px_-16px_hsl(var(--primary))] hover:brightness-[1.06]": variant === "default",
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
      {label && <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{label}</label>}
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
      {label && <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{label}</label>}
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
      {label && <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{label}</label>}
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
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 pb-24 safe-bottom sm:p-4 sm:pb-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-lg border border-white/10 bg-[hsl(var(--background))]/98 rounded-t-4xl sm:rounded-4xl shadow-[0_24px_80px_-32px_rgba(15,23,42,0.75)] max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <div className="flex items-center justify-between p-5 border-b border-[hsl(var(--border))]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Detail</p>
            <h2 className="mt-1 font-semibold text-lg leading-tight">{title}</h2>
          </div>
          <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] text-xl leading-none">
            ✕
          </button>
        </div>
        <div className="p-5 pb-7 safe-bottom">{children}</div>
      </div>
    </div>
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
