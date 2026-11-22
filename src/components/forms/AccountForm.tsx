import { useState } from "react";
import { Banknote, CreditCard, Landmark, Smartphone, TrendingUp } from "lucide-react";
import { Modal } from "@/components/ui";
import { NoteLine, RowsCard, SubmitButton } from "@/components/forms/formParts";
import { cn, ACCOUNT_COLORS, ACCOUNT_ICONS, ACCOUNT_TYPE_LABELS, formatNumberWithSeparator } from "@/lib/utils";
import { addAccount, updateAccount, recalculateAccountBalance } from "@/db/accounts";
import type { Account } from "@/types";

interface AccountFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  existing?: Account;
}

const accountTypes = [
  { value: "bank", label: ACCOUNT_TYPE_LABELS.bank, Icon: Landmark },
  { value: "ewallet", label: "E-wallet", Icon: Smartphone },
  { value: "cash", label: ACCOUNT_TYPE_LABELS.cash, Icon: Banknote },
  { value: "credit", label: "Kartu kredit", Icon: CreditCard },
  { value: "investment", label: ACCOUNT_TYPE_LABELS.investment, Icon: TrendingUp },
] as const;

export function AccountForm({ open, onClose, onSaved, existing }: AccountFormProps) {
  const [name, setName] = useState(existing?.name ?? "");
  const [type, setType] = useState<Account["type"]>(existing?.type ?? "bank");
  const [color, setColor] = useState(existing?.color ?? ACCOUNT_COLORS[0]);
  const [icon, setIcon] = useState(existing?.icon ?? ACCOUNT_ICONS[existing?.type ?? "bank"]);
  const [initialBalance, setInitialBalance] = useState(String(existing?.initialBalance ?? 0));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function pickType(next: Account["type"]) {
    // The icon follows the type until the user picks their own.
    if (icon === ACCOUNT_ICONS[type]) setIcon(ACCOUNT_ICONS[next]);
    setType(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Nama akun wajib diisi");
      return;
    }
    const balance = Number(initialBalance.replace(/\D/g, ""));
    const finalIcon = icon.trim() || ACCOUNT_ICONS[type];
    setLoading(true);
    try {
      if (existing?.id) {
        await updateAccount(existing.id, { name: name.trim(), type, color, icon: finalIcon, initialBalance: balance });
        await recalculateAccountBalance(existing.id);
      } else {
        await addAccount({ name: name.trim(), type, color, icon: finalIcon, initialBalance: balance, isArchived: false });
      }
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  const labelCls = "text-xs text-[hsl(var(--muted-foreground))]";
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing ? "Edit akun" : "Akun baru"}
      closePosition="left"
      footer={<SubmitButton form="account-form" disabled={loading}>{loading ? "Menyimpan..." : "Simpan akun"}</SubmitButton>}
    >
      <form id="account-form" onSubmit={handleSubmit} className="space-y-4">
        <section aria-labelledby="account-type-label" className="space-y-2">
          <h2 id="account-type-label" className="px-1 text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Jenis</h2>
          <div role="radiogroup" aria-labelledby="account-type-label" className="grid grid-cols-3 gap-2">
            {accountTypes.map(({ value, label, Icon }) => {
              const checked = type === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => pickType(value)}
                  className={cn(
                    "flex h-[72px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                    checked ? "border-2 border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10" : "border border-[hsl(var(--border))] bg-[hsl(var(--card))]",
                  )}
                >
                  <Icon size={20} aria-hidden="true" className={checked ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"} />
                  <span className="w-full truncate text-center">{label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <RowsCard>
          <label className="flex cursor-text flex-col gap-1 px-4 py-3">
            <span className={labelCls}>Nama akun</span>
            <input
              type="text"
              aria-label="Nama akun"
              placeholder="contoh: BCA, GoPay, Dompet"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              className="min-h-8 bg-transparent p-0 text-base font-semibold placeholder:font-normal placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none"
            />
            {error && <span role="alert" className="text-xs text-danger">{error}</span>}
          </label>
          <label className="flex cursor-text flex-col gap-1 px-4 py-3">
            <span className={labelCls}>{existing ? "Saldo awal" : "Saldo saat ini"}</span>
            <input
              type="text"
              inputMode="numeric"
              aria-label={existing ? "Saldo awal" : "Saldo saat ini"}
              placeholder="0"
              value={formatNumberWithSeparator(initialBalance)}
              onChange={(e) => setInitialBalance(e.target.value.replace(/\D/g, ""))}
              className="min-h-8 bg-transparent p-0 text-base font-semibold tabular-nums focus:outline-none"
            />
          </label>
          <label className="flex min-h-[52px] cursor-text items-center justify-between gap-3 px-4">
            <span className={labelCls}>Ikon</span>
            <input
              type="text"
              aria-label="Ikon"
              maxLength={4}
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              className="min-h-11 w-24 bg-transparent text-right text-lg focus:outline-none"
            />
          </label>
          <div className="flex flex-col gap-1 px-4 py-3">
            <span id="account-color-label" className={labelCls}>Warna</span>
            <div role="radiogroup" aria-labelledby="account-color-label" className="-mx-2 flex flex-wrap">
              {ACCOUNT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  onClick={() => setColor(c)}
                  aria-label={`Warna ${c}`}
                  className="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                >
                  <span
                    className="block h-7 w-7 rounded-full"
                    style={{
                      background: c,
                      boxShadow: color === c ? `0 0 0 2px hsl(var(--card)), 0 0 0 4px hsl(var(--foreground))` : undefined,
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
        </RowsCard>

        {existing && <NoteLine>Untuk mencocokkan saldo saat ini, gunakan Cocokkan saldo di halaman Akun.</NoteLine>}
        {type === "credit" && (
          <div className="rounded-2xl border border-warning/30 bg-warning/10 px-3.5 py-3 text-[13px] text-[hsl(var(--foreground))]">
            Belanja dengan <b>Kartu kredit</b> dicatat sebagai pengeluaran, dan tagihannya bisa dilunasi dari menu Hutang.
          </div>
        )}
      </form>
    </Modal>
  );
}
