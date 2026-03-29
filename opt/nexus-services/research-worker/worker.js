#!/usr/bin/env node

const { main } = require('./src/index');

main().catch((error) => {
  const text = String(error && (error.stack || error.message || error));
  console.error(`[worker] fatal error: ${text}`);
  process.exitCode = 1;
});
