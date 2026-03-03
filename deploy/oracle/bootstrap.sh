#!/usr/bin/env bash
set -euo pipefail

# Ubuntu 22.04+ baseline setup for Oracle VM
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx git curl

# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# App directory
sudo mkdir -p /opt/nexus-api
sudo chown -R "$USER":"$USER" /opt/nexus-api

# Clone or update app repo
# git clone https://github.com/<ORG>/<REPO>.git /opt/nexus-api

# Nginx config
sudo cp deploy/oracle/nginx.api.goclearonline.cc.conf /etc/nginx/sites-available/nexus-api
sudo ln -sf /etc/nginx/sites-available/nexus-api /etc/nginx/sites-enabled/nexus-api
sudo nginx -t
sudo systemctl reload nginx

# TLS certificate
sudo certbot --nginx -d api.goclearonline.cc --non-interactive --agree-tos -m <LETSENCRYPT_EMAIL>

# Systemd service
sudo cp deploy/oracle/nexus-api.service /etc/systemd/system/nexus-api.service
sudo systemctl daemon-reload
sudo systemctl enable nexus-api
sudo systemctl restart nexus-api
sudo systemctl status nexus-api --no-pager
