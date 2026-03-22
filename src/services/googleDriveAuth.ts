import type { GoogleAuthState } from "@/types";

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GoogleTokenClient = {
  callback: (response: GoogleTokenResponse) => void;
  requestAccessToken: (options?: { prompt?: string }) => void;
};

type GoogleAccounts = {
  oauth2: {
    initTokenClient: (config: {
      client_id: string;
      scope: string;
      callback: (response: GoogleTokenResponse) => void;
      error_callback?: () => void;
    }) => GoogleTokenClient;
    revoke: (token: string, callback?: () => void) => void;
  };
};

declare global {
  interface Window {
    google?: {
      accounts?: GoogleAccounts;
    };
  }
}

const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");
const AUTH_STORAGE_KEY = "google_drive_auth";
const TOKEN_EXPIRY_BUFFER_MS = 30_000;

let gisLoadPromise: Promise<void> | null = null;
let tokenClientPromise: Promise<GoogleTokenClient> | null = null;

type StoredAuth = {
  accessToken: string;
  expiresAt: number;
};

function getClientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? "";
}

function isConfigured(): boolean {
  return getClientId().length > 0;
}

function readStoredAuth(): StoredAuth | null {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredAuth;
    if (!parsed.accessToken || !parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredAuth(payload: StoredAuth | null) {
  if (!payload) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
}

function isTokenValid(stored: StoredAuth | null): stored is StoredAuth {
  if (!stored) return false;
  return stored.expiresAt > Date.now() + TOKEN_EXPIRY_BUFFER_MS;
}

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (gisLoadPromise) {
    return gisLoadPromise;
  }

  gisLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Gagal memuat Google Identity script")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Gagal memuat Google Identity script"));
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

async function getTokenClient(): Promise<GoogleTokenClient> {
  if (tokenClientPromise) {
    return tokenClientPromise;
  }

  tokenClientPromise = (async () => {
    const clientId = getClientId();
    if (!clientId) {
      throw new Error("Google Client ID belum diatur. Isi VITE_GOOGLE_CLIENT_ID di environment.");
    }

    await loadGoogleScript();
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      throw new Error("Google OAuth tidak tersedia di browser ini.");
    }

    return oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPES,
      callback: () => {
        // Callback akan dioverride saat request token.
      },
      error_callback: () => {
        // Handling utama ditangani di callback response.
      },
    });
  })();

  return tokenClientPromise;
}

export function getGoogleAuthState(): GoogleAuthState {
  const stored = readStoredAuth();
  const valid = isTokenValid(stored);

  return {
    isConfigured: isConfigured(),
    isSignedIn: valid,
    expiresAt: valid ? stored.expiresAt : null,
  };
}

export async function getGoogleAccessToken(interactive: boolean): Promise<string> {
  if (!isConfigured()) {
    throw new Error("Google Client ID belum diatur. Isi VITE_GOOGLE_CLIENT_ID.");
  }

  const stored = readStoredAuth();
  if (isTokenValid(stored)) {
    return stored.accessToken;
  }

  const tokenClient = await getTokenClient();

  return new Promise((resolve, reject) => {
    tokenClient.callback = (response) => {
      if (response.error || !response.access_token || !response.expires_in) {
        reject(new Error(response.error_description ?? response.error ?? "Gagal login Google."));
        return;
      }

      const expiresAt = Date.now() + response.expires_in * 1000;
      const payload: StoredAuth = {
        accessToken: response.access_token,
        expiresAt,
      };
      writeStoredAuth(payload);
      resolve(payload.accessToken);
    };

    try {
      tokenClient.requestAccessToken({ prompt: interactive ? "select_account" : "" });
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Gagal meminta token Google."));
    }
  });
}

export async function signOutGoogleDrive(): Promise<void> {
  const stored = readStoredAuth();
  if (!stored) {
    writeStoredAuth(null);
    return;
  }

  await loadGoogleScript();
  const revoke = window.google?.accounts?.oauth2?.revoke;

  await new Promise<void>((resolve) => {
    if (!revoke) {
      resolve();
      return;
    }
    revoke(stored.accessToken, () => resolve());
  });

  writeStoredAuth(null);
}

export function clearGoogleAuthLocalState() {
  writeStoredAuth(null);
}
