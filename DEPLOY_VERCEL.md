# Deploy to Vercel

## Prerequisites

- [Vercel account](https://vercel.com/signup)
- Git repo with this project (e.g. `examples/flappy-bird` in a monorepo)

## Option A: Deploy from the repo root (monorepo)

If your repo root is the parent of `examples/flappy-bird`:

1. **Import project in Vercel**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your Git repository

2. **Configure the project**
   - **Root Directory:** Click “Edit” and set to `examples/flappy-bird`
   - **Framework Preset:** Vite (or “Other”)
   - **Build Command:** `pnpm run build` (or leave default; `vercel.json` sets it)
   - **Output Directory:** `dist` (or leave default; `vercel.json` sets it)
   - **Install Command:** `pnpm install` (if you use pnpm)

3. **Deploy**
   - Click “Deploy”. Vercel will build and deploy; the `/api/extended` proxy is handled by `vercel.json` rewrites.

## Option B: Deploy from this folder only

If you only deploy the `flappy-bird` folder (e.g. its own repo or subfolder deploy):

1. **Import project in Vercel**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import the repo (or drag the `examples/flappy-bird` folder if using CLI).

2. **Use defaults**
   - Root is the current folder; `vercel.json` already sets:
     - `buildCommand`: `pnpm run build`
     - `outputDirectory`: `dist`
     - Rewrites for `/api/extended` → Extended API

3. **Deploy**
   - Click “Deploy” (or run `vercel` / `vercel --prod` from this folder).

## CLI (from this directory)

```bash
cd examples/flappy-bird
pnpm install
npx vercel
# follow prompts; for production: npx vercel --prod
```

## What `vercel.json` does

- **Build:** Runs `pnpm run build` and uses `dist` as the static output.
- **Rewrites:** Requests to `/api/extended/*` are proxied to `https://api.starknet.extended.exchange/*` so the app’s API calls work without CORS issues (same as the Vite dev proxy).

## Environment variables

The app works without env vars for basic deployment. If you add any (e.g. for analytics or feature flags), set them in the Vercel project: **Settings → Environment Variables**.

## Troubleshooting

- **404 on refresh:** Vite SPA routing is used; Vercel serves `index.html` for all routes by default for a single-page app. If you add client-side routes, you may need a `rewrites` entry that sends all routes to `/index.html`.
- **API errors:** Ensure `vercel.json` is in the same directory as the one set as “Root Directory” so the `/api/extended` rewrites are applied.
- **Build fails:** In the monorepo case, set Root Directory to `examples/flappy-bird` and use `pnpm install` (or your package manager) so dependencies resolve correctly.
