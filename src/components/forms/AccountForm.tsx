import { useState } from "react";
import { Button, Input, Select, Modal } from "@/components/ui";
import { formatCurrency, ACCOUNT_COLORS, ACCOUNT_ICONS, ACCOUNT_TYPE_LABELS } from "@/lib/utils";
import { addAccount, updateAccount } from "@/db/accounts";
import type { Account } from "@/types";

interface AccountFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  existing?: Account;
}

const accountTypes = ["bank", "ewallet", "cash", "credit", "investment"] as const;

export function AccountForm({ open, onClose, onSaved, existing }: AccountFormProps) {
  const [name, setName] = useState(existing?.name ?? "");
  const [type, setType] = useState<Account["type"]>(existing?.type ?? "bank");
  const [color, setColor] = useState(existing?.color ?? ACCOUNT_COLORS[0]);
  const [initialBalance, setInitialBalance] = useState(String(existing?.initialBalance ?? 0));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const icon = ACCOUNT_ICONS[type];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Nama akun wajib diisi");
      return;
    }
    const balance = Number(initialBalance.replace(/\D/g, ""));
    setLoading(true);
    try {
      if (existing?.id) {
        await updateAccount(existing.id, { name: name.trim(), type, color, icon });
      } else {
        await addAccount({ name: name.trim(), type, color, icon, initialBalance: balance, isArchived: false });
      }
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit Akun" : "Tambah Akun"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nama Akun"
          placeholder="contoh: BCA, GoPay, Dompet"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          error={error}
        />
        <Select label="Tipe Akun" value={type} onChange={(e) => setType(e.target.value as Account["type"])}>
          {accountTypes.map((t) => (
            <option key={t} value={t}>
              {ACCOUNT_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
        {!existing && (
          <Input label="Saldo Awal" type="number" placeholder="0" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} />
        )}
        <div className="space-y-2">
          <label className="text-sm font-medium">Warna</label>
          <div className="flex flex-wrap gap-2">
            {ACCOUNT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full transition-transform"
                style={{
                  background: c,
                  outline: color === c ? `3px solid ${c}` : "none",
                  outlineOffset: "2px",
                  transform: color === c ? "scale(1.2)" : undefined,
                }}
              />
            ))}
          </div>
        </div>
        {/* Preview */}
        <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: color + "20", border: `1px solid ${color}40` }}>
          <span className="text-2xl">{icon}</span>
          <div>
            <p className="font-semibold text-sm" style={{ color }}>
              {name || "Nama Akun"}
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              {existing ? formatCurrency(existing.currentBalance) : formatCurrency(Number(initialBalance || 0))}
            </p>
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Menyimpan..." : existing ? "Simpan Perubahan" : "Tambah Akun"}
        </Button>
      </form>
    </Modal>
  );
}
