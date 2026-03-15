#!/usr/bin/env node

const { config } = require('./src/config');
const { createSupabase } = require('./src/db');
const { runWatchdogOnce } = require('./src/watchdog');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLoop() {
  const supabase = createSupabase(config);

  if (!config.enabled) {
    console.log('[watchdog] disabled by WATCHDOG_ENABLED=false');
    return;
  }

  while (true) {
    try {
      await runWatchdogOnce({ supabase, config, logger: console });
    } catch (error) {
      console.error(`[watchdog] cycle_error=${String(error && (error.stack || error.message || error))}`);
    }

    await sleep(config.pollSeconds * 1000);
  }
}

async function main(argv = process.argv.slice(2)) {
  const once = argv.includes('--once');
  const supabase = createSupabase(config);

  if (!config.enabled) {
    console.log('[watchdog] disabled by WATCHDOG_ENABLED=false');
    return;
  }

  if (once) {
    await runWatchdogOnce({ supabase, config, logger: console });
    return;
  }

  await runLoop();
}

main().catch((error) => {
  console.error(`[watchdog] fatal=${String(error && (error.stack || error.message || error))}`);
  process.exitCode = 1;
});
