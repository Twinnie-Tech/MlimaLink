import { waitForPortOpen } from '@nx/node/utils';

/* eslint-disable */
var __TEARDOWN_MESSAGE__: string;

module.exports = async function () {
  console.log('\nSetting up...\n');

  const host = process.env.HOST ?? 'localhost';
  const gatewayPort = process.env.PORT ? Number(process.env.PORT) : 3000;
  const apiPort = process.env.API_PORT ? Number(process.env.API_PORT) : 3333;

  // Gateway proxies /api → API; both must be up before tests run
  await waitForPortOpen(apiPort, { host });
  await waitForPortOpen(gatewayPort, { host });

  globalThis.__TEARDOWN_MESSAGE__ = '\nTearing down...\n';
};
