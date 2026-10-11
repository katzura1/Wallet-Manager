import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));

export function readConfig(content) {
  const env = parseEnv(content);
  for (const key of ['FTP_HOST', 'FTP_USER', 'FTP_PASSWORD', 'FTP_REMOTE_DIR']) {
    if (!env[key]?.trim()) throw new Error(`${key} wajib diisi di .env.ftp.`);
  }
  if (!/^[a-zA-Z0-9.-]+$/.test(env.FTP_HOST)) {
    throw new Error('FTP_HOST harus hostname/IP tanpa protocol atau path.');
  }
  const port = env.FTP_PORT || '21';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('FTP_PORT harus antara 1 dan 65535.');
  }
  if (env.FTP_SECURE && !['true', 'false'].includes(env.FTP_SECURE)) {
    throw new Error('FTP_SECURE harus true atau false.');
  }
  const remote = env.FTP_REMOTE_DIR.replace(/\/+$/, '');
  if (!remote || remote.split('/').some(part => part === '.' || part === '..')) {
    throw new Error('FTP_REMOTE_DIR harus folder tujuan, bukan root atau path dengan . / .. .');
  }
  // curl uses %2F to start from the FTP root; ordinary paths start from the login directory.
  const remotePath = remote.split('/').map(encodeURIComponent).join('/');
  return {
    baseUrl: `ftp://${env.FTP_HOST}:${port}/${remote.startsWith('/') ? '%2F' + remotePath.slice(1) : remotePath}/`,
    credentials: `${env.FTP_USER}:${env.FTP_PASSWORD}`,
    secure: env.FTP_SECURE !== 'false',
  };
}

export function uploadFiles(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) return uploadFiles(join(directory, entry.name), relative + '/');
    if (!entry.isFile()) throw new Error(`File bukan regular file: ${relative}`);
    if (entry.name.startsWith('.env')) throw new Error(`Menolak upload file rahasia: ${relative}`);
    return [relative];
  }).sort((a, b) => {
    // Publish entry points after their assets, with the PWA worker last.
    const priority = file => file === 'sw.js' ? 2 : file === 'index.html' ? 1 : 0;
    return priority(a) - priority(b) || a.localeCompare(b);
  });
}

export function curlConfig(config, relative) {
  const quote = value => '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
    .replaceAll('\n', '\\n').replaceAll('\r', '\\r').replaceAll('\t', '\\t') + '"';
  return `user = ${quote(config.credentials)}\nurl = ${quote(config.baseUrl + relative.split('/').map(encodeURIComponent).join('/'))}\n`;
}

function main() {
  if (process.argv.slice(2).some(arg => arg !== '--dry-run')) {
    throw new Error('Penggunaan: npm run deploy -- [--dry-run]');
  }
  const config = readConfig(readFileSync(join(root, '.env.ftp'), 'utf8'));
  const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
  if (build.error || build.status !== 0) throw new Error('Build gagal; upload dibatalkan.');
  const dist = join(root, 'dist');
  const files = uploadFiles(dist);
  if (!files.includes('index.html')) throw new Error('dist/index.html tidak ditemukan.');
  const dryRun = process.argv.includes('--dry-run');
  for (const file of files) {
    console.log(`${dryRun ? '[dry-run]' : '[upload]'} ${file}`);
    if (dryRun) continue;
    const result = spawnSync('curl', [
      '--disable', '--config', '-', '--silent', '--show-error', '--fail',
      '--globoff', '--ftp-create-dirs', '--connect-timeout', '30', '--max-time', '300',
      ...(config.secure ? ['--ssl-reqd'] : []), '--upload-file', join(dist, file),
    ], { input: curlConfig(config, file), encoding: 'utf8', stdio: ['pipe', 'ignore', 'pipe'] });
    if (result.error || result.status !== 0) {
      // Do not print curl diagnostics: server responses can contain credentials.
      throw new Error(`Upload gagal: ${file} (curl ${result.status ?? 'tidak tersedia'}). Cek koneksi, TLS, login, dan izin folder.`);
    }
  }
  console.log(dryRun ? `Dry-run selesai: ${files.length} file, tidak ada upload.` : `Deploy selesai: ${files.length} file.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main(); } catch (error) {
    console.error(error.code === 'ENOENT' ? 'File .env.ftp atau tool yang diperlukan tidak ditemukan.' : error.message);
    process.exitCode = 1;
  }
}
