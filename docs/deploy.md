# Deployment runbook (not deployed)

Target: Cloudflare Workers Free. Nothing has been deployed from this repo.

## What is configured (`wrangler.jsonc`)
- Worker `conduct-pilot-adoption`, entry `src/worker.ts`, static assets from `./public`.
- Durable Object class `PilotWorkspace`, declared with `new_sqlite_classes` (the SQLite storage
  backend, the one available on the Free plan).
- `workers_dev: true`, `preview_urls: false`, observability off, no routes, no secrets, no paid
  bindings.

## Checks to run before deploying
```bash
npm ci
npm run typecheck
npm test
npm run eval            # expect 12/12 green
npm run eval:broken     # expect 1 red and a non-zero exit (deliberate)
npm run check:wrangler  # wrangler deploy --dry-run, makes no network changes
npm run dev             # local at http://localhost:8787
npm run ui:check        # with dev running: 24 browser checks, writes docs/screenshots
```

## Deploying (for the owner, when a destination is approved)
1. Confirm the Worker name `conduct-pilot-adoption` does not already exist in the target account,
   so nothing unrelated is overwritten. Rename in `wrangler.jsonc` if it does.
2. `npx wrangler login` with the approved account, then `npx wrangler deploy`.
3. Check `/api/health` returns `{"ok":true,"synthetic":true,"writesToExternalSystems":false}`.

## Data handling
Each visitor gets a random cookie and a separate SQLite-backed Durable Object. State is wiped after
14 days without activity. No personal data is requested; cohort imports accept synthetic IDs only.
