import { waitForPortOpen } from '@nx/node/utils';

/* eslint-disable */
var __TEARDOWN_MESSAGE__: string;

module.exports = async function () {
  console.log('\nSetting up...\n');

  const host = '127.0.0.1';
  const gatewayPort = process.env.PORT ? Number(process.env.PORT) : 3000;
  const apiPort = process.env.API_PORT ? Number(process.env.API_PORT) : 3333;

  // Runner script starts servers; wait until both accept connections
  await waitForPortOpen(apiPort, { host });
  await waitForPortOpen(gatewayPort, { host });

  globalThis.__TEARDOWN_MESSAGE__ = '\nTearing down...\n';
};
