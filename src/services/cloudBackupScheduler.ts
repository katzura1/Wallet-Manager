import { createBackupData } from "@/lib/backup";
import { getGoogleAccessToken } from "@/services/googleDriveAuth";
import { uploadBackupToDrive } from "@/services/googleDrive";
import type { CloudBackupSettings } from "@/types";

const SETTINGS_KEY = "google_drive_backup_settings";
const LAST_RUN_KEY = "google_drive_backup_last_run";

let schedulerTimer: number | null = null;
let isRunning = false;

const DEFAULT_SETTINGS: CloudBackupSettings = {
  enabled: false,
  intervalHours: 24,
};

function clampIntervalHours(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.intervalHours;
  return Math.min(168, Math.max(1, Math.round(value)));
}

export function getCloudBackupSettings(): CloudBackupSettings {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return DEFAULT_SETTINGS;

  try {
    const parsed = JSON.parse(raw) as Partial<CloudBackupSettings>;
    return {
      enabled: Boolean(parsed.enabled),
      intervalHours: clampIntervalHours(parsed.intervalHours ?? DEFAULT_SETTINGS.intervalHours),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveCloudBackupSettings(settings: CloudBackupSettings) {
  const next: CloudBackupSettings = {
    enabled: settings.enabled,
    intervalHours: clampIntervalHours(settings.intervalHours),
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
}

async function executeAutoBackup() {
  if (isRunning || !navigator.onLine) {
    return;
  }

  const settings = getCloudBackupSettings();
  if (!settings.enabled) {
    return;
  }

  const lastRunRaw = localStorage.getItem(LAST_RUN_KEY);
  const lastRunAt = lastRunRaw ? Number(lastRunRaw) : 0;
  const nextAllowedAt = lastRunAt + settings.intervalHours * 60 * 60 * 1000;

  if (lastRunAt > 0 && Date.now() < nextAllowedAt) {
    return;
  }

  isRunning = true;
  try {
    const token = await getGoogleAccessToken(false);
    const backup = await createBackupData();
    await uploadBackupToDrive(token, backup);
    localStorage.setItem(LAST_RUN_KEY, String(Date.now()));
  } catch {
    // Silent by design: scheduler should not interrupt app usage.
  } finally {
    isRunning = false;
  }
}

export function startCloudBackupScheduler() {
  if (schedulerTimer !== null) {
    return;
  }

  schedulerTimer = window.setInterval(() => {
    void executeAutoBackup();
  }, 60_000);

  void executeAutoBackup();
}

export function stopCloudBackupScheduler() {
  if (schedulerTimer === null) {
    return;
  }

  window.clearInterval(schedulerTimer);
  schedulerTimer = null;
}
