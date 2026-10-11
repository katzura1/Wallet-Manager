import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { curlConfig, readConfig, uploadFiles } from '../scripts/deploy.mjs';

const env = 'FTP_HOST=ftp.example.com\nFTP_USER=wallet\nFTP_PASSWORD="p#ass\\word"\nFTP_REMOTE_DIR=public_html/wallet';

test('FTP config parses quoted passwords, validates destination and defaults to TLS', () => {
  const config = readConfig(env);
  assert.equal(config.credentials, 'wallet:p#ass\\word');
  assert.equal(config.baseUrl, 'ftp://ftp.example.com:21/public_html/wallet/');
  assert.equal(config.secure, true);
  assert.equal(readConfig(env + '\nFTP_SECURE=false').secure, false);
  assert.equal(readConfig(env + '\nFTP_REMOTE_DIR=/web/my site/').baseUrl,
    'ftp://ftp.example.com:21/%2Fweb/my%20site/');
  for (const extra of ['FTP_PORT=0', 'FTP_PORT=65536', 'FTP_HOST=ftp://example.com',
    'FTP_REMOTE_DIR=/', 'FTP_REMOTE_DIR=../web', 'FTP_PASSWORD=', 'FTP_SECURE=maybe']) {
    assert.throws(() => readConfig(env + '\n' + extra));
  }
});

test('curl config escapes credentials and encodes remote file names', () => {
  const config = readConfig(env);
  config.credentials = 'wallet:a"b\\c\nurl = "injected"';
  assert.equal(curlConfig(config, 'assets/my file#1.js'),
    'user = "wallet:a\\"b\\\\c\\nurl = \\"injected\\""\n' +
    'url = "ftp://ftp.example.com:21/public_html/wallet/assets/my%20file%231.js"\n');
});

test('upload traverses assets before entry points and rejects secrets/symlinks', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wallet-deploy-test-'));
  try {
    mkdirSync(join(directory, 'assets'));
    for (const file of ['index.html', 'sw.js', 'workbox.js', 'assets/app.js']) {
      writeFileSync(join(directory, file), 'test');
    }
    assert.deepEqual(uploadFiles(directory), ['assets/app.js', 'workbox.js', 'index.html', 'sw.js']);
    writeFileSync(join(directory, '.env.ftp'), 'secret');
    assert.throws(() => uploadFiles(directory), /rahasia/);
    rmSync(join(directory, '.env.ftp'));
    symlinkSync(join(directory, 'index.html'), join(directory, 'linked.html'));
    assert.throws(() => uploadFiles(directory), /regular file/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
