/* eslint-disable */

module.exports = async function () {
  // Servers are started/stopped by tools/run-api-gateway-e2e.mjs
  console.log(globalThis.__TEARDOWN_MESSAGE__ ?? '\nTearing down...\n');
};
