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
  const keyClass =
    "flex h-16 items-center justify-center rounded-2xl border border-border bg-card text-xl font-semibold text-foreground transition-transform hover:bg-surface-2 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]";

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background select-none app-shell">
      <div className="flex w-full max-w-sm flex-col items-center gap-7 px-8">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-2xl text-primary-foreground">
            💰
          </div>
          <h1 className="text-xl font-bold text-foreground">Masukkan PIN</h1>
          <p className="text-center text-sm text-muted-foreground">Masukkan PIN untuk membuka kembali ruang kerja finansial kamu</p>
        </div>

        <div
          role="status"
          aria-label={`${input.length} dari 4 digit terisi`}
          className={`flex gap-4 ${shake ? "animate-[shake_0.4s_ease]" : ""}`}
        >
          {dots.map((filled, i) => (
            <div
              key={i}
              className={`h-4 w-4 rounded-full border-2 transition-all ${
                filled ? (error ? "border-danger bg-danger" : "border-primary bg-primary") : "border-border"
              }`}
            />
          ))}
        </div>

        <p role="alert" className="-mt-3 h-4 text-xs text-danger">{error ? "PIN salah, coba lagi" : ""}</p>

        <div className="grid w-full grid-cols-3 gap-3">
          {["1","2","3","4","5","6","7","8","9"].map((d) => (
            <button key={d} onClick={() => press(d)} className={keyClass}>
              {d}
            </button>
          ))}
          <div />
          <button onClick={() => press("0")} className={keyClass}>
            0
          </button>
          <button onClick={del} aria-label="Hapus digit" className={keyClass}>
            ⌫
          </button>
        </div>
      </div>
    </div>
  );
}
