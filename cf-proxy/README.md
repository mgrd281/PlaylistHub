# IPTV Proxy — Cloudflare Worker

## Deploy (one-time setup)

Run these three commands from this directory (`cf-proxy/`):

```bash
cd cf-proxy
npm install
npm run login    # opens browser → sign in to Cloudflare (once)
npm run deploy   # uploads worker.js to Cloudflare
```

The last command prints the Worker URL — something like:

```
https://iptv-proxy.<your-subdomain>.workers.dev
```

## After deploy

Copy that URL, then on Vercel:

1. Project → Settings → Environment Variables
2. Set `STREAM_PROXY_URL` = the Worker URL above
3. Redeploy the Vercel project

## Verify

Open in your browser:

```
https://<your-vercel-domain>/api/stream/diagnose?url=<any-channel-url>
```

The `CF Worker (your STREAM_PROXY_URL)` row should show `"ok": true`.

## Re-deploy after code changes

```bash
npm run deploy
```
