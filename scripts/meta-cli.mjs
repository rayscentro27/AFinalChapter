#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const VERSION = '0.1.0';
const DEFAULT_GRAPH_VERSION = 'v20.0';
const CONFIG_DIR = path.join(os.homedir(), '.meta-cli');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

function usage() {
  console.log(`meta-cli ${VERSION}

Usage:
  meta help
  meta version

  meta config show
  meta config set [--access-token TOKEN] [--whatsapp-token TOKEN] [--phone-number-id ID] [--page-id ID] [--graph-version vXX.X]

  meta test
  meta me
  meta pages
  meta whatsapp-profile

Environment overrides:
  META_ACCESS_TOKEN
  META_WHATSAPP_TOKEN
  META_PHONE_NUMBER_ID
  META_PAGE_ID
  META_GRAPH_VERSION
`);
}

function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function writeConfig(cfg) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
}

function mergedConfig() {
  const cfg = readConfig();
  return {
    graph_version: process.env.META_GRAPH_VERSION || cfg.graph_version || DEFAULT_GRAPH_VERSION,
    access_token: process.env.META_ACCESS_TOKEN || cfg.access_token || '',
    whatsapp_token: process.env.META_WHATSAPP_TOKEN || cfg.whatsapp_token || '',
    phone_number_id: process.env.META_PHONE_NUMBER_ID || cfg.phone_number_id || '',
    page_id: process.env.META_PAGE_ID || cfg.page_id || '',
  };
}

function maskSecret(value) {
  const v = String(value || '');
  if (!v) return '';
  if (v.length <= 8) return '********';
  return `${v.slice(0, 4)}...${v.slice(-4)}`;
}

function parseFlags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const cur = argv[i];
    if (!cur.startsWith('--')) continue;
    const key = cur.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

async function graphGet(endpoint, token) {
  const url = endpoint.startsWith('https://')
    ? endpoint
    : `https://graph.facebook.com/${endpoint}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg = data?.error?.message || data?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.details = data;
    throw err;
  }

  return data;
}

function ensureToken(cfg, preferWhatsApp = false) {
  const token = preferWhatsApp ? (cfg.whatsapp_token || cfg.access_token) : cfg.access_token;
  if (!token) {
    throw new Error('Missing access token. Run: meta config set --access-token <token>');
  }
  return token;
}

function printJson(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

async function run() {
  const [, , cmd = 'help', subcmd, ...rest] = process.argv;

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    usage();
    return;
  }

  if (cmd === 'version' || cmd === '--version' || cmd === '-v') {
    console.log(VERSION);
    return;
  }

  if (cmd === 'config') {
    if (subcmd === 'show') {
      const cfg = mergedConfig();
      printJson({
        config_file: CONFIG_PATH,
        graph_version: cfg.graph_version,
        access_token: maskSecret(cfg.access_token),
        whatsapp_token: maskSecret(cfg.whatsapp_token),
        phone_number_id: cfg.phone_number_id || null,
        page_id: cfg.page_id || null,
      });
      return;
    }

    if (subcmd === 'set') {
      const flags = parseFlags(rest);
      const current = readConfig();
      const next = {
        ...current,
        ...(flags['access-token'] ? { access_token: String(flags['access-token']).trim() } : {}),
        ...(flags['whatsapp-token'] ? { whatsapp_token: String(flags['whatsapp-token']).trim() } : {}),
        ...(flags['phone-number-id'] ? { phone_number_id: String(flags['phone-number-id']).trim() } : {}),
        ...(flags['page-id'] ? { page_id: String(flags['page-id']).trim() } : {}),
        ...(flags['graph-version'] ? { graph_version: String(flags['graph-version']).trim() } : {}),
      };
      writeConfig(next);
      console.log(`Saved config to ${CONFIG_PATH}`);
      return;
    }

    usage();
    process.exitCode = 1;
    return;
  }

  const cfg = mergedConfig();

  if (cmd === 'me') {
    const token = ensureToken(cfg);
    const endpoint = `${cfg.graph_version}/me?fields=id,name&access_token=${encodeURIComponent(token)}`;
    const data = await graphGet(endpoint, token);
    printJson(data);
    return;
  }

  if (cmd === 'pages') {
    const token = ensureToken(cfg);
    const endpoint = `${cfg.graph_version}/me/accounts?fields=id,name,category&access_token=${encodeURIComponent(token)}`;
    const data = await graphGet(endpoint, token);
    printJson(data);
    return;
  }

  if (cmd === 'whatsapp-profile') {
    const token = ensureToken(cfg, true);
    const phoneId = cfg.phone_number_id;
    if (!phoneId) {
      throw new Error('Missing phone_number_id. Run: meta config set --phone-number-id <id>');
    }
    const endpoint = `${cfg.graph_version}/${encodeURIComponent(phoneId)}?fields=id,display_phone_number,verified_name&access_token=${encodeURIComponent(token)}`;
    const data = await graphGet(endpoint, token);
    printJson(data);
    return;
  }

  if (cmd === 'test') {
    const out = {
      me: null,
      pages: null,
      whatsapp_profile: null,
    };

    try {
      const token = ensureToken(cfg);
      out.me = await graphGet(`${cfg.graph_version}/me?fields=id,name&access_token=${encodeURIComponent(token)}`, token);
    } catch (e) {
      out.me = { ok: false, error: e.message };
    }

    try {
      const token = ensureToken(cfg);
      out.pages = await graphGet(`${cfg.graph_version}/me/accounts?fields=id,name,category&access_token=${encodeURIComponent(token)}`, token);
    } catch (e) {
      out.pages = { ok: false, error: e.message };
    }

    try {
      const token = ensureToken(cfg, true);
      if (!cfg.phone_number_id) throw new Error('Missing phone_number_id');
      out.whatsapp_profile = await graphGet(`${cfg.graph_version}/${encodeURIComponent(cfg.phone_number_id)}?fields=id,display_phone_number,verified_name&access_token=${encodeURIComponent(token)}`, token);
    } catch (e) {
      out.whatsapp_profile = { ok: false, error: e.message };
    }

    printJson(out);
    return;
  }

  usage();
  process.exitCode = 1;
}

run().catch((err) => {
  const payload = {
    error: err?.message || 'Unknown error',
    status: err?.status || null,
    details: err?.details || null,
  };
  printJson(payload);
  process.exit(1);
});
