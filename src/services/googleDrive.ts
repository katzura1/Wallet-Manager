import type { BackupData } from "@/lib/backup";
import type { GoogleDriveBackupFile } from "@/types";
import { createBackupFilename } from "@/lib/backup";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const APP_FOLDER_NAME = "Wallet Manager Backups";
const APP_FOLDER_ID_KEY = "google_drive_wallet_folder_id";

type DriveFileListResponse = {
  files?: Array<{
    id: string;
    name: string;
    createdTime: string;
    modifiedTime: string;
    size?: string;
  }>;
};

async function driveFetch(input: string, accessToken: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Drive API error (${response.status}): ${text || response.statusText}`);
  }

  return response;
}

async function ensureBackupFolder(accessToken: string): Promise<string> {
  const cachedFolderId = localStorage.getItem(APP_FOLDER_ID_KEY);
  if (cachedFolderId) {
    try {
      await driveFetch(`${DRIVE_API_BASE}/files/${cachedFolderId}?fields=id`, accessToken);
      return cachedFolderId;
    } catch {
      localStorage.removeItem(APP_FOLDER_ID_KEY);
    }
  }

  const query = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and trashed=false and name='${APP_FOLDER_NAME.replace(/'/g, "\\'")}'`,
  );

  const listUrl = `${DRIVE_API_BASE}/files?q=${query}&fields=files(id,name)&pageSize=1`;
  const listResponse = await driveFetch(listUrl, accessToken);
  const listData = (await listResponse.json()) as { files?: Array<{ id: string }> };

  const existingFolderId = listData.files?.[0]?.id;
  if (existingFolderId) {
    localStorage.setItem(APP_FOLDER_ID_KEY, existingFolderId);
    return existingFolderId;
  }

  const createResponse = await driveFetch(`${DRIVE_API_BASE}/files?fields=id`, accessToken, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: APP_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });

  const created = (await createResponse.json()) as { id: string };
  localStorage.setItem(APP_FOLDER_ID_KEY, created.id);
  return created.id;
}

export async function uploadBackupToDrive(accessToken: string, backup: BackupData): Promise<GoogleDriveBackupFile> {
  const folderId = await ensureBackupFolder(accessToken);
  const fileName = createBackupFilename(backup.exportedAt);
  const metadata = {
    name: fileName,
    mimeType: "application/json",
    parents: [folderId],
  };

  const boundary = `wallet-${Date.now()}`;
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json",
    "",
    JSON.stringify(backup),
    `--${boundary}--`,
  ].join("\r\n");

  const response = await driveFetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,createdTime,modifiedTime,size`,
    accessToken,
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  const data = (await response.json()) as {
    id: string;
    name: string;
    createdTime: string;
    modifiedTime: string;
    size?: string;
  };

  return {
    id: data.id,
    name: data.name,
    createdTime: data.createdTime,
    modifiedTime: data.modifiedTime,
    size: Number(data.size ?? 0),
  };
}

export async function listBackupsFromDrive(accessToken: string, pageSize = 20): Promise<GoogleDriveBackupFile[]> {
  const folderId = await ensureBackupFolder(accessToken);
  const query = encodeURIComponent(`'${folderId}' in parents and trashed=false and name contains 'wallet-backup-'`);
  const url = `${DRIVE_API_BASE}/files?q=${query}&fields=files(id,name,createdTime,modifiedTime,size)&orderBy=createdTime desc&pageSize=${pageSize}`;

  const response = await driveFetch(url, accessToken);
  const data = (await response.json()) as DriveFileListResponse;

  return (data.files ?? []).map((file) => ({
    id: file.id,
    name: file.name,
    createdTime: file.createdTime,
    modifiedTime: file.modifiedTime,
    size: Number(file.size ?? 0),
  }));
}

export async function downloadBackupFromDrive(accessToken: string, fileId: string): Promise<Blob> {
  const response = await driveFetch(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, accessToken);
  return response.blob();
}
