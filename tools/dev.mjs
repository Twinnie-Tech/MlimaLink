/**
 * Starts API, API Gateway, and user-ui (Next.js) for local development.
 * Usage: node tools/dev.mjs  (or npm run dev)
 */
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const node = process.execPath;

const apiMain = path.join(root, 'apps/api/dist/main.js');
const gatewayMain = path.join(root, 'apps/api-gateway/dist/main.js');
const nextBin = path.join(root, 'node_modules/next/dist/bin/next');
const userUiDir = path.join(root, 'apps/user-ui');

for (const file of [apiMain, gatewayMain, nextBin]) {
  if (!existsSync(file)) {
    console.error(`Missing ${file}. Run: npm run build:backend`);
    process.exit(1);
  }
}

const children = [];

function start(name, args, color) {
  const child = spawn(node, args, {
    cwd: root,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tag = `[${name}]`;
  child.stdout.on('data', (d) =>
    process.stdout.write(`${color}${tag}\x1b[0m ${d}`),
  );
  child.stderr.on('data', (d) =>
    process.stderr.write(`${color}${tag}\x1b[0m ${d}`),
  );
  child.on('exit', (code, signal) => {
    console.log(`${tag} exited code=${code} signal=${signal}`);
    shutdown(code ?? 1);
  });
  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 500);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('Starting API, Gateway, and user-ui...');
start('api', [apiMain], '\x1b[34m');
start('gateway', [gatewayMain], '\x1b[35m');
start('user-ui', [nextBin, 'dev', userUiDir, '--port', '4200'], '\x1b[32m');
