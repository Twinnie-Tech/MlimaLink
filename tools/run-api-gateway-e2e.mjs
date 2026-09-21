/**
 * Starts API + gateway, runs api-gateway Jest e2e, then shuts down.
 * Avoids Nx failing when continuous serve tasks are killed after e2e.
 */
import { spawn } from 'child_process';
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
    shell: process.platform === 'win32',
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
    if (!child.killed) {
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

await waitForUrl('http://127.0.0.1:3333/api');
await waitForUrl('http://127.0.0.1:3000/api');

const jestCli = join(root, 'node_modules/jest/bin/jest.js');
const jest = spawn(
  process.execPath,
  [jestCli, '--config', 'jest.config.cts', '--passWithNoTests'],
  {
    cwd: join(root, 'apps/api-gateway-e2e'),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: '3000',
      API_PORT: '3333',
    },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);

const exitCode = await new Promise((resolve) => {
  jest.on('exit', (code) => resolve(code ?? 1));
});

shutdown();
process.exit(exitCode);
