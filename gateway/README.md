# Nexus Gateway

Fastify webhook gateway for:
- Twilio SMS/MMS webhooks
- Meta Page webhooks
- WhatsApp Cloud API webhooks

It verifies signatures, resolves `tenant_id` via `channel_accounts`, and stores idempotent events in `provider_events`.

## Local run

```bash
cp .env.example .env
npm install
npm run start
```

Health check:

```bash
curl -s http://127.0.0.1:3000/health
```
