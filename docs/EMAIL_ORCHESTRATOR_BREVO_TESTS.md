# Email Orchestrator: Brevo-First Test Commands

## 1) Send transactional email via orchestrator

```bash
curl -X POST "${SUPABASE_URL}/functions/v1/email-orchestrator/send" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "message_type": "transactional",
    "to": "user@example.com",
    "subject": "Nexus transactional test",
    "html": "<p>This is a transactional test from Nexus.</p>",
    "text": "This is a transactional test from Nexus.",
    "template_key": "tx_test",
    "data": { "source": "curl_test" }
  }'
```

Expected: JSON response with `message_id`, `provider` (`brevo`), and `status`.

## 2) Ingest Brevo webhook payload

```bash
curl -X POST "${SUPABASE_URL}/functions/v1/email-orchestrator/webhook/brevo" \
  -H "Content-Type: application/json" \
  -H "x-signature: ${EMAIL_WEBHOOK_SECRET_BREVO}" \
  -d '[
    {
      "event": "delivered",
      "messageId": "<example-message-id@brevo>",
      "email": "user@example.com"
    }
  ]'
```

Expected: JSON response with `processed`, `provider`, and webhook verification fields.

## 3) Ingest MailerLite webhook payload (optional)

```bash
curl -X POST "${SUPABASE_URL}/functions/v1/email-orchestrator/webhook/mailerlite" \
  -H "Content-Type: application/json" \
  -H "x-signature: ${EMAIL_WEBHOOK_SECRET_MAILERLITE}" \
  -d '{
    "event": "subscriber.unsubscribed",
    "email": "user@example.com",
    "message_id": "ml-example-id"
  }'
```

Expected: event inserted into `esp_webhook_events`; related message/contact status updated when message mapping exists.
