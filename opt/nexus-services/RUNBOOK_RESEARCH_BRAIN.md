# Nexus Research Brain Runbook (Add-Only)

This runbook deploys **new** services only under `/opt/nexus-services`.
It does **not** modify:
- `/opt/nexus-api/gateway`
- `nexus-api.service`
- `/home/opc/afinal_gateway`
- `nexus-gateway.service`

## 1. Create service directories

```bash
sudo mkdir -p /opt/nexus-services/youtube-watcher/src
sudo mkdir -p /opt/nexus-services/research-worker/src
sudo mkdir -p /opt/nexus-services/ops/systemd
sudo mkdir -p /opt/nexus-services/ops/supabase
sudo chown -R ubuntu:ubuntu /opt/nexus-services
```

If you staged files elsewhere, copy them now:

```bash
# Example staging source (adjust as needed)
sudo rsync -av /home/ubuntu/staging/opt/nexus-services/ /opt/nexus-services/
sudo chown -R ubuntu:ubuntu /opt/nexus-services
```

## 2. Install Node dependencies

```bash
cd /opt/nexus-services/youtube-watcher
npm ci

cd /opt/nexus-services/research-worker
npm ci
```

## 3. Configure environment files

```bash
cd /opt/nexus-services/youtube-watcher
cp .env.example .env

cd /opt/nexus-services/research-worker
cp .env.example .env
```

Set values in both `.env` files:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN` (optional but recommended)
- `TELEGRAM_CHAT_ID` (optional but recommended)

Worker-specific:
- `OPENCLAW_GATEWAY_URL` (optional; primary provider if available)
- `GEMINI_API_KEY` (fallback provider)
- `MAX_ITEMS_PER_RUN` (default `3`)
- `ENABLE_GEMINI_FALLBACK` (default `true`)

## 4. Apply Supabase schema

Run SQL from:
- `/opt/nexus-services/ops/supabase/research_brain.sql`

Option A: Supabase SQL Editor
- Paste and run the whole file.

Option B: psql (if DB connection string is available)

```bash
psql "$SUPABASE_DB_URL" -f /opt/nexus-services/ops/supabase/research_brain.sql
```

## 5. Seed watchlist channels

Example SQL:

```sql
insert into youtube_watchlist (channel_id, rss_url, channel_name, is_enabled)
values
  ('UC_x5XG1OV2P6uZZ5FSM9Ttw', null, 'Google for Developers', true),
  ('UCVHFbqXqoYvEWM1Ddxl0QDg', null, 'Veritasium', true)
on conflict (channel_id) do update
set
  rss_url = excluded.rss_url,
  channel_name = excluded.channel_name,
  is_enabled = excluded.is_enabled,
  updated_at = now();
```

## 6. Install systemd units/timers

```bash
sudo cp /opt/nexus-services/ops/systemd/youtube-watcher.service /etc/systemd/system/
sudo cp /opt/nexus-services/ops/systemd/youtube-watcher.timer /etc/systemd/system/
sudo cp /opt/nexus-services/ops/systemd/research-worker.service /etc/systemd/system/
sudo cp /opt/nexus-services/ops/systemd/research-worker.timer /etc/systemd/system/

sudo systemctl daemon-reload
sudo systemctl enable --now youtube-watcher.timer
sudo systemctl enable --now research-worker.timer
```

## 6a. Transcript extraction (yt-dlp)

Install `yt-dlp` on Oracle VM (recommended: official latest binary):

```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
yt-dlp --version
```

Fallback (Ubuntu package):

```bash
sudo apt-get update
sudo apt-get install -y --no-install-recommends yt-dlp
yt-dlp --version
```

Transcript files are stored in:
- `/tmp/nexus-transcripts`

Manual transcript test:

```bash
cd /opt/nexus-services/research-worker
node worker.js --transcript-test "https://www.youtube.com/watch?v=VIDEO_ID"
```

## 7. Manual test: watcher once

```bash
sudo systemctl start youtube-watcher.service
sudo journalctl -u youtube-watcher -n 100 --no-pager
```

Expected:
- `youtube_seen` receives new `video_id` rows
- `research_inbox` receives `status='queued'` rows

## 8. Manual test: worker once

```bash
sudo systemctl start research-worker.service
sudo journalctl -u research-worker -n 100 --no-pager
```

Expected:
- `research_inbox` rows move to `done` or `skipped`
- `research_artifacts` rows inserted for processed items
- `research_claims` rows inserted for extracted claims
- `research_runs` row inserted with provider/model/status

## 9. Validate data in Supabase

Research inbox check:

```sql
select id, status, title, source_url, artifact_id, error, created_at
from research_inbox
order by id desc
limit 20;
```

Artifacts check:

```sql
select id, title, channel_name, trace_id, created_at
from research_artifacts
order by id desc
limit 20;
```

Claims check:

```sql
select c.id, c.artifact_id, left(c.claim_text, 120) as claim_preview
from research_claims c
order by c.id desc
limit 20;
```

## 10. Required validation commands

```bash
dig +short app.goclearonline.cc
dig +short api.goclearonline.cc
```

Supabase query example:

```sql
select id, status, title from research_inbox order by id desc limit 10;
```

Service logs:

```bash
journalctl -u youtube-watcher -n 100 --no-pager
journalctl -u research-worker -n 100 --no-pager
```

## 11. Enable/disable timers

Disable:

```bash
sudo systemctl disable --now youtube-watcher.timer
sudo systemctl disable --now research-worker.timer
```

Enable:

```bash
sudo systemctl enable --now youtube-watcher.timer
sudo systemctl enable --now research-worker.timer
```

Timer status:

```bash
systemctl list-timers --all | grep -E 'youtube-watcher|research-worker'
```

## 12. Safety notes

- This deployment is add-only under `/opt/nexus-services`.
- Existing Nexus API/Gateway services are untouched.
- No inbound public ports are required for these jobs.
- Telegram notification path is outbound-only via Bot API.
- Transcript strategy is transcript-first (RSS + transcript fetch), no browser automation.
