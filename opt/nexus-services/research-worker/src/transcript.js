const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const TRANSCRIPT_DIR = '/tmp/nexus-transcripts';

async function ensureTranscriptDir() {
  await fs.mkdir(TRANSCRIPT_DIR, { recursive: true });
}

function decodeHtmlEntities(text) {
  return String(text)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      const value = Number(code);
      return Number.isFinite(value) ? String.fromCharCode(value) : '';
    });
}

function cleanVtt(vttRaw) {
  const lines = String(vttRaw).split(/\r?\n/);
  const kept = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^WEBVTT/i.test(line)) continue;
    if (/^NOTE\b/i.test(line)) continue;
    if (/^Kind:/i.test(line)) continue;
    if (/^Language:/i.test(line)) continue;
    if (/^\d+$/.test(line)) continue;
    if (line.includes('-->')) continue;

    const noTags = line.replace(/<[^>]+>/g, ' ');
    const decoded = decodeHtmlEntities(noTags).replace(/\s+/g, ' ').trim();
    if (!decoded) continue;

    if (kept.length === 0 || kept[kept.length - 1] !== decoded) {
      kept.push(decoded);
    }
  }

  return kept.join(' ').replace(/\s+/g, ' ').trim();
}

async function runYtDlp(videoUrl, args, timeoutMs) {
  try {
    await execFileAsync('yt-dlp', [...args, videoUrl], {
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, error: null };
  } catch (error) {
    const stderr = String(error.stderr || '').trim();
    const message = stderr || String(error.message || error);
    return { ok: false, error: message.slice(0, 1000) };
  }
}

async function resolveVideoId(videoUrl, timeoutMs) {
  try {
    const { stdout } = await execFileAsync(
      'yt-dlp',
      ['--skip-download', '--no-playlist', '--quiet', '--no-warnings', '--print', 'id', videoUrl],
      {
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      }
    );

    const id = String(stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    return id || null;
  } catch {
    return null;
  }
}

async function clearExistingVtts(videoId) {
  const entries = await fs.readdir(TRANSCRIPT_DIR).catch(() => []);
  const targets = entries.filter((name) => name.startsWith(`${videoId}.`) && name.endsWith('.vtt'));
  await Promise.all(
    targets.map((name) => fs.rm(path.join(TRANSCRIPT_DIR, name), { force: true }).catch(() => {}))
  );
}

async function findVttPath(videoId) {
  const entries = await fs.readdir(TRANSCRIPT_DIR).catch(() => []);
  const matches = entries
    .filter((name) => name.startsWith(`${videoId}.`) && name.endsWith('.vtt'))
    .map((name) => path.join(TRANSCRIPT_DIR, name));

  if (matches.length === 0) return null;

  const stats = await Promise.all(
    matches.map(async (filePath) => ({
      filePath,
      mtimeMs: (await fs.stat(filePath)).mtimeMs,
    }))
  );

  stats.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return stats[0].filePath;
}

function languageFromPath(filePath) {
  const base = path.basename(filePath);
  const match = base.match(/\.([a-zA-Z-]+)\.vtt$/);
  return match ? match[1] : null;
}

async function fetchTranscript(videoUrl, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs || 90000);
  await ensureTranscriptDir();

  const videoId = await resolveVideoId(videoUrl, timeoutMs);
  if (!videoId) {
    return {
      ok: false,
      method: 'none',
      language: null,
      transcriptText: null,
      rawPath: null,
      error: 'no_transcript',
    };
  }

  const outputTemplate = path.join(TRANSCRIPT_DIR, '%(id)s.%(ext)s');

  const attempts = [
    {
      method: 'subs',
      args: [
        '--skip-download',
        '--no-playlist',
        '--quiet',
        '--no-warnings',
        '--write-subs',
        '--sub-lang',
        'en.*',
        '--sub-format',
        'vtt',
        '-o',
        outputTemplate,
      ],
    },
    {
      method: 'auto-subs',
      args: [
        '--skip-download',
        '--no-playlist',
        '--quiet',
        '--no-warnings',
        '--write-auto-subs',
        '--sub-lang',
        'en.*',
        '--sub-format',
        'vtt',
        '-o',
        outputTemplate,
      ],
    },
  ];

  for (const attempt of attempts) {
    await clearExistingVtts(videoId);
    await runYtDlp(videoUrl, attempt.args, timeoutMs);

    const vttPath = await findVttPath(videoId);
    if (!vttPath) {
      continue;
    }

    const raw = await fs.readFile(vttPath, 'utf8');
    const transcriptText = cleanVtt(raw);

    if (!transcriptText) {
      continue;
    }

    return {
      ok: true,
      method: attempt.method,
      language: languageFromPath(vttPath),
      transcriptText,
      rawPath: vttPath,
      error: null,
    };
  }

  return {
    ok: false,
    method: 'none',
    language: null,
    transcriptText: null,
    rawPath: null,
    error: 'no_transcript',
  };
}

module.exports = {
  TRANSCRIPT_DIR,
  fetchTranscript,
};
