# Connectly Web — Vercel Deployment

This package contains the Next.js web application and the shared workspace package required by it. It intentionally excludes the Fastify server, mobile app, desktop app, local environment files, secrets, and build artifacts.

## Vercel project settings

Import this folder/repository into Vercel and use:

- Framework Preset: Next.js
- Root Directory: `.` (repository root; do not set it to `apps/web` because this is a pnpm workspace)
- Install Command: `corepack enable && pnpm install --no-frozen-lockfile`
- Build Command: `pnpm --filter @connectly/web build`
- Output Directory: leave the default (Next.js)
- Node.js: 22.x

If Vercel automatically detects the pnpm package manager, the install command can be left at its default. The explicit command above is also valid.

## Required Vercel environment variable

Set this for Production (and Preview if you want preview deployments to use the same API):

```env
NEXT_PUBLIC_API_URL=https://YOUR-RENDER-API.onrender.com
```

Replace the value with the actual public URL of the deployed Connectly API. Do not add database credentials, JWT secrets, Brevo API keys, admin passwords, or LiveKit API secrets to the frontend project.

After changing `NEXT_PUBLIC_API_URL`, redeploy the Vercel project because Next.js embeds `NEXT_PUBLIC_` values into the browser bundle at build time.

## After Vercel deployment

Copy the final Vercel URL, for example `https://connectly-demo.vercel.app`, into the Render API environment:

```env
WEB_ORIGIN=https://connectly-demo.vercel.app
APP_BASE_URL=https://connectly-demo.vercel.app
```

Then redeploy the Render API. The API must allow this exact origin in its CORS configuration.

## Important notes

- This package is only the web frontend and its workspace dependency. It does not deploy the API.
- Deploy the API separately from the backend repository.
- The API must be running and reachable for login, messaging, notifications, calls, reports, and admin features.
- Persistent media storage must be configured on the backend before relying on uploaded images, voice messages, or report evidence in production.
- Never commit `.env` files or credentials.
