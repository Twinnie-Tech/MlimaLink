import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnvFile } from 'dotenv';

for (const path of [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
]) {
  if (existsSync(path)) {
    loadEnvFile({ path });
    break;
  }
}
