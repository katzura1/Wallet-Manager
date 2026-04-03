const lastAIRunMap = new Map<string, number>();

export function assertAIRequestAllowed(featureKey: string, minIntervalMs = 2500) {
  const now = Date.now();
  const lastRun = lastAIRunMap.get(featureKey) ?? 0;
  const elapsed = now - lastRun;

  if (elapsed < minIntervalMs) {
    const waitSeconds = Math.max(1, Math.ceil((minIntervalMs - elapsed) / 1000));
    throw new Error(`Permintaan AI terlalu cepat. Coba lagi dalam ${waitSeconds} detik.`);
  }

  lastAIRunMap.set(featureKey, now);
}

export function isAIOnline() {
  return navigator.onLine;
}
