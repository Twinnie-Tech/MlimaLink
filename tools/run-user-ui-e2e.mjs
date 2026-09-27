/**
 * Starts API + gateway + user-ui (next start), runs user-ui Playwright e2e, then shuts down.
 * Avoids hanging when Playwright webServer is nested under `nx run-commands`.
 */
import { spawn, spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const children = [];
let shuttingDown = false;

function start(command, args, cwd, env = {}) {
  const child = spawn(command, args, {
    cwd: join(root, cwd),
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const tag = `[${cwd}]`;
  child.stdout?.on('data', (d) => process.stdout.write(`${tag} ${d}`));
  child.stderr?.on('data', (d) => process.stderr.write(`${tag} ${d}`));
  children.push(child);
  return child;
}

async function waitForUrl(url, timeoutMs = 120_000) {
  const startAt = Date.now();
  let lastError;

  while (Date.now() - startAt < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(
    `Timed out waiting for ${url}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    if (process.platform === 'win32') {
      // SIGTERM does not reach grandchildren on Windows; kill the whole tree.
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
      });
    } else {
      child.kill('SIGTERM');
    }
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(1);
});
process.on('SIGTERM', () => {
  shutdown();
  process.exit(1);
});

start(process.execPath, ['dist/main.js'], 'apps/api', {
  HOST: '0.0.0.0',
  API_PORT: '3333',
});
start(process.execPath, ['dist/main.js'], 'apps/api-gateway', {
  HOST: '0.0.0.0',
  PORT: '3000',
  API_URL: 'http://127.0.0.1:3333',
});
start(
  process.execPath,
  [
    join(root, 'node_modules/next/dist/bin/next'),
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    '4200',
  ],
  'apps/user-ui',
  { NODE_ENV: 'production' },
);

await waitForUrl('http://127.0.0.1:3333/api');
await waitForUrl('http://127.0.0.1:3000/api');
await waitForUrl('http://127.0.0.1:4200/');

const playwright = spawn(
  process.execPath,
  [join(root, 'node_modules/@playwright/test/cli.js'), 'test'],
  {
    cwd: join(root, 'apps/user-ui-e2e'),
    env: {
      ...process.env,
      BASE_URL: 'http://127.0.0.1:4200',
      // Servers already running — Playwright must not try to bind ports again
      PLAYWRIGHT_REUSE_SERVERS: '1',
    },
    stdio: 'inherit',
  },
);

const exitCode = await new Promise((resolve) => {
  playwright.on('exit', (code) => resolve(code ?? 1));
});

shutdown();
process.exit(exitCode);
