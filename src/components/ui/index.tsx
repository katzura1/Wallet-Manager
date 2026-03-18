import { cn } from "@/lib/utils";
import * as React from "react";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border bg-[hsl(var(--card))] border-[hsl(var(--border))] shadow-sm", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 pb-2", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 pt-0", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-semibold text-sm text-[hsl(var(--muted-foreground))]", className)} {...props} />;
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "destructive" | "success";
  size?: "sm" | "md" | "lg" | "icon";
}

export function Button({ className, variant = "default", size = "md", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
        {
          "bg-indigo-600 text-white hover:bg-indigo-700": variant === "default",
          "border border-[hsl(var(--border))] bg-transparent hover:bg-[hsl(var(--accent))]": variant === "outline",
          "bg-transparent hover:bg-[hsl(var(--accent))]": variant === "ghost",
          "bg-red-500 text-white hover:bg-red-600": variant === "destructive",
          "bg-emerald-500 text-white hover:bg-emerald-600": variant === "success",
          "text-sm px-3 py-1.5 h-8": size === "sm",
          "text-sm px-4 py-2 h-10": size === "md",
          "text-base px-6 py-3 h-12": size === "lg",
          "w-9 h-9 p-0": size === "icon",
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
          "w-full rounded-xl border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-base placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-indigo-500",
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
          "w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500",
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
          "w-full rounded-xl border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-base placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", className)} {...props} />;
}

// Simple Modal
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-md bg-[hsl(var(--background))] rounded-t-3xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-[hsl(var(--border))]">
          <h2 className="font-semibold text-base">{title}</h2>
          <button onClick={onClose} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] text-xl leading-none">
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function EmptyState({ icon, title, description }: { icon: string; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
      <span className="text-4xl">{icon}</span>
      <p className="font-semibold text-[hsl(var(--foreground))]">{title}</p>
      {description && <p className="text-sm text-[hsl(var(--muted-foreground))]">{description}</p>}
    </div>
  );
}
