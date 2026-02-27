# Oracle Gateway (Phase 0 -> 1)

Current live operations runbook: [docs/playbooks/oracle_gateway_named_tunnel_runbook.md](./playbooks/oracle_gateway_named_tunnel_runbook.md)


## 1) Oracle VM + OS bootstrap

1. Create Oracle Free Tier VM (`Ubuntu 22.04`), open ports `80` and `443`.
2. Point DNS `A` record:
   - `api.yourdomain.com -> <oracle_public_ip>`
3. Install runtime packages:

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install nginx certbot python3-certbot-nginx git ufw
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt -y install nodejs
node -v && npm -v
```

4. Firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status
```

## 2) Deploy gateway service

```bash
git clone <your_repo_url> /home/ubuntu/app
cd /home/ubuntu/app/gateway
npm install
cp .env.example .env
nano .env
npm run start
```

Required `.env` values:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TWILIO_AUTH_TOKEN`
- `META_APP_SECRET`
- `META_VERIFY_TOKEN`
- `WHATSAPP_VERIFY_TOKEN`

## 3) Supabase migration

Run migrations including:
- `supabase/migrations/20260223125000_gateway_channels_and_provider_events.sql`

This adds:
- `public.channel_accounts` for tenant/channel mapping
- `public.provider_events` for idempotent webhook event capture

## 4) Configure channel mapping

Insert per tenant/channel in Supabase SQL:

```sql
insert into public.channel_accounts (tenant_id, provider, external_account_id, label)
values
  ('<tenant-uuid>', 'twilio', '+14805551234', 'Primary SMS Number'),
  ('<tenant-uuid>', 'meta', '131069194210954', 'Clear Credentials Page'),
  ('<tenant-uuid>', 'whatsapp', '<phone_number_id>', 'WhatsApp Cloud Number');
```

## 5) Nginx reverse proxy + HTTPS

1. Copy `gateway/deploy/nginx.nexus-gateway.conf` to `/etc/nginx/sites-available/nexus-gateway`
2. Enable:

```bash
sudo ln -s /etc/nginx/sites-available/nexus-gateway /etc/nginx/sites-enabled/nexus-gateway
sudo nginx -t
sudo systemctl reload nginx
```

3. TLS:

```bash
sudo certbot --nginx -d api.yourdomain.com
```

## 6) systemd always-on service

```bash
sudo cp /home/ubuntu/app/gateway/deploy/nexus-gateway.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable nexus-gateway
sudo systemctl start nexus-gateway
sudo systemctl status nexus-gateway
```

## 7) Webhook endpoints

- `GET /health`
- `POST /webhooks/twilio/sms`
- `POST /webhooks/twilio/status`
- `GET /webhooks/meta` (verification)
- `POST /webhooks/meta`
- `GET /webhooks/whatsapp` (verification)
- `POST /webhooks/whatsapp`

## 8) Notes

- Tenant resolution is UUID-based through `channel_accounts`.
- Events are idempotent via unique key `(provider, provider_event_id)`.
- Unresolved events are stored with `tenant_id = null` for triage.

## 9) Meta webhook subscriptions + payload routing

Use one webhook endpoint for both Page Messenger and Instagram Messaging:
- `GET /webhooks/meta`
- `POST /webhooks/meta`

Subscribe these Messenger fields (Page):
- `messages`
- `message_echoes`
- `message_deliveries`
- `message_reads`

Instagram Messaging should also be subscribed on the same app webhook setup.

Payload routing implemented in gateway:
- `entry[].messaging[]` -> Messenger events (inbound + delivery/read/echo status callbacks)
- `entry[].changes[]` -> Instagram/Meta changes envelopes (delivery/read + inbound variants)

Status handling behavior:
- Delivery/read updates by `messages.provider_message_id_real`
- Read watermark resolution uses conversation participant mapping first, then contact/conversation fallback:
  - `provider='meta'`
  - `external_user_id = sender id (PSID or IG-scoped id)`
  - `external_page_id = recipient page/IG object id`

Signature verification:
- Header: `X-Hub-Signature-256`
- Algorithm: `HMAC-SHA256` with `META_APP_SECRET`

Operational note:
- If `conversation_participants` is not deployed yet, resolver falls back to `contacts.fb_psid` and recent `conversations`.
- If `message_delivery_events` is not deployed yet, status updates still apply to `messages` and `outbox_messages`.
