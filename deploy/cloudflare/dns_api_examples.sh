#!/usr/bin/env bash
set -euo pipefail

# Inputs
export CF_API_TOKEN="<CLOUDFLARE_API_TOKEN>"
export CF_ZONE_ID="<CLOUDFLARE_ZONE_ID>"
export NETLIFY_TARGET="<NETLIFY_SITE_TARGET>"   # e.g. your-site.netlify.app
export ORACLE_PUBLIC_IP="<ORACLE_PUBLIC_IP>"

# app.goclearonline.cc -> CNAME (Netlify target)
curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "{\"type\":\"CNAME\",\"name\":\"app\",\"content\":\"${NETLIFY_TARGET}\",\"ttl\":1,\"proxied\":false}"

# api.goclearonline.cc -> A (Oracle VM public IP)
curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "{\"type\":\"A\",\"name\":\"api\",\"content\":\"${ORACLE_PUBLIC_IP}\",\"ttl\":1,\"proxied\":false}"
