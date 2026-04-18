#!/bin/bash
# ─────────────────────────────────────────────────────────
# PlaylistHub Scanner Service — Oracle Cloud VM Setup
# Run this on the Oracle Cloud VM via SSH:
#   bash setup-oracle.sh
# ─────────────────────────────────────────────────────────

set -e

APP_DIR="$HOME/scanner-service"
PORT=8787

echo "=== PlaylistHub Scanner Service Setup ==="

# 1. Install Node.js 20 if not present
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]]; then
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "Node: $(node -v)"

# 2. Install cloudflared if not present
if ! command -v cloudflared &>/dev/null; then
  echo "Installing cloudflared..."
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
  sudo dpkg -i /tmp/cloudflared.deb
  rm /tmp/cloudflared.deb
fi
echo "cloudflared: $(cloudflared --version)"

# 3. Create app directory and copy files
mkdir -p "$APP_DIR"
cd "$APP_DIR"

# Copy package.json and server.js (assumes they're in the same dir as this script)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "$SCRIPT_DIR/package.json" "$APP_DIR/"
cp "$SCRIPT_DIR/server.js" "$APP_DIR/"

# 4. Install dependencies
npm install --production

# 5. Stop existing services
echo "Stopping existing services..."
sudo systemctl stop scanner-service 2>/dev/null || true
sudo systemctl stop cloudflared-tunnel 2>/dev/null || true
pkill -f "node server.js" 2>/dev/null || true
pkill -f "cloudflared tunnel" 2>/dev/null || true

# 6. Create systemd service for scanner
sudo tee /etc/systemd/system/scanner-service.service > /dev/null <<EOF
[Unit]
Description=PlaylistHub Scanner Service
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=PORT=$PORT
Environment=NODE_ENV=production
Environment=SCANNER_API_ENFORCE_TOKEN=false

[Install]
WantedBy=multi-user.target
EOF

# 7. Create systemd service for cloudflared tunnel
sudo tee /etc/systemd/system/cloudflared-tunnel.service > /dev/null <<EOF
[Unit]
Description=Cloudflare Quick Tunnel for Scanner
After=network.target scanner-service.service
Requires=scanner-service.service

[Service]
Type=simple
User=$USER
ExecStart=/usr/bin/cloudflared tunnel --url http://localhost:$PORT --logfile /tmp/tunnel.log
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# 8. Enable and start services
sudo systemctl daemon-reload
sudo systemctl enable scanner-service cloudflared-tunnel
sudo systemctl start scanner-service
sleep 2
sudo systemctl start cloudflared-tunnel

# 9. Wait for tunnel URL
echo "Waiting for tunnel URL..."
for i in $(seq 1 30); do
  TUNNEL_URL=$(grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/tunnel.log 2>/dev/null | tail -1)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 2
done

echo ""
echo "=========================================="
if [ -n "$TUNNEL_URL" ]; then
  echo "Scanner Service is running!"
  echo "Tunnel URL: $TUNNEL_URL"
  echo ""
  echo "Set these on Vercel Environment Variables:"
  echo "  SCANNER_API_URL = $TUNNEL_URL"
  echo "  SCANNER_STREAM_URL = $TUNNEL_URL"
  echo ""
  echo "Test: curl $TUNNEL_URL/health"
else
  echo "WARNING: Tunnel URL not found yet."
  echo "Check: sudo journalctl -u cloudflared-tunnel -f"
  echo "Or: cat /tmp/tunnel.log"
fi
echo "=========================================="
