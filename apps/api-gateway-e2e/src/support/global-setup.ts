import { waitForPortOpen } from '@nx/node/utils';

/* eslint-disable */
var __TEARDOWN_MESSAGE__: string;

module.exports = async function () {
  console.log('\nSetting up...\n');

  // Always probe loopback — servers may bind 0.0.0.0
  const host = '127.0.0.1';
  const gatewayPort = process.env.GATEWAY_PORT
    ? Number(process.env.GATEWAY_PORT)
    : process.env.PORT
      ? Number(process.env.PORT)
      : 3000;
  const apiPort = process.env.API_PORT ? Number(process.env.API_PORT) : 3333;

  // Gateway proxies /api → API; both must be up before tests run
  await waitForPortOpen(apiPort, { host });
  await waitForPortOpen(gatewayPort, { host });

  globalThis.__TEARDOWN_MESSAGE__ = '\nTearing down...\n';
};
