import { useState } from "react";
import { usePinStore } from "@/stores/walletStore";

export function LockScreen() {
  const { pin, unlock } = usePinStore();
  const [input, setInput] = useState("");
  const [shake, setShake] = useState(false);
  const [error, setError] = useState(false);

  function press(digit: string) {
    if (input.length >= 4) return;
    const next = input + digit;
    setInput(next);
    if (next.length === 4) {
      if (next === pin) {
        unlock();
      } else {
        setShake(true);
        setError(true);
        setTimeout(() => {
          setShake(false);
          setError(false);
          setInput("");
        }, 700);
      }
    }
  }

  function del() {
    setInput((v) => v.slice(0, -1));
    setError(false);
  }

  const dots = Array.from({ length: 4 }, (_, i) => i < input.length);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[hsl(var(--background))] select-none app-shell">
      <div className="flex flex-col items-center gap-8 w-full max-w-sm px-8">
        {/* App icon */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-18 h-18 rounded-[28px] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] flex items-center justify-center text-2xl shadow-[0_20px_50px_-28px_hsl(var(--primary))]">
            💰
          </div>
          <p className="text-xl font-bold text-[hsl(var(--foreground))]">Wallet</p>
          <p className="text-sm text-[hsl(var(--muted-foreground))] text-center">Masukkan PIN untuk membuka kembali ruang kerja finansial kamu</p>
        </div>

        {/* Dots */}
        <div className={`flex gap-4 ${shake ? "animate-[shake_0.4s_ease]" : ""}`}>
          {dots.map((filled, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all ${
                filled
                  ? error
                    ? "bg-red-500 border-red-500"
                    : "bg-[hsl(var(--primary))] border-[hsl(var(--primary))]"
                  : "border-[hsl(var(--border))]"
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-xs text-red-500 -mt-4">PIN salah, coba lagi</p>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 w-full rounded-[32px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]/70 p-4 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.6)]">
          {["1","2","3","4","5","6","7","8","9"].map((d) => (
            <button
              key={d}
              onClick={() => press(d)}
              className="h-16 rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-xl font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] active:scale-95 transition-transform shadow-sm"
            >
              {d}
            </button>
          ))}
          {/* empty, 0, delete */}
          <div />
          <button
            onClick={() => press("0")}
            className="h-16 rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-xl font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] active:scale-95 transition-transform shadow-sm"
          >
            0
          </button>
          <button
            onClick={del}
            className="h-16 rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-xl font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] active:scale-95 transition-transform shadow-sm"
          >
            ⌫
          </button>
        </div>
      </div>
    </div>
  );
}
