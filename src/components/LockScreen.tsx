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
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[hsl(var(--background))] select-none">
      <div className="flex flex-col items-center gap-8 w-full max-w-xs px-8">
        {/* App icon */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center text-2xl shadow-lg">
            💰
          </div>
          <p className="text-lg font-bold text-[hsl(var(--foreground))]">Wallet</p>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Masukkan PIN untuk membuka</p>
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
                    : "bg-indigo-600 border-indigo-600"
                  : "border-[hsl(var(--border))]"
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-xs text-red-500 -mt-4">PIN salah, coba lagi</p>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {["1","2","3","4","5","6","7","8","9"].map((d) => (
            <button
              key={d}
              onClick={() => press(d)}
              className="h-16 rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-xl font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] active:scale-95 transition-transform shadow-sm"
            >
              {d}
            </button>
          ))}
          {/* empty, 0, delete */}
          <div />
          <button
            onClick={() => press("0")}
            className="h-16 rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-xl font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] active:scale-95 transition-transform shadow-sm"
          >
            0
          </button>
          <button
            onClick={del}
            className="h-16 rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-xl font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] active:scale-95 transition-transform shadow-sm"
          >
            ⌫
          </button>
        </div>
      </div>
    </div>
  );
}
