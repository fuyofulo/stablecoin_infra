# Frontend Vercel Readiness

## Current state

- Production build passes with `npm run build` in `frontend/`.
- Frontend runtime config is committed in `config/frontend.public.json`.
- Frontend expects the backend API at `https://api.axoria.fun`.
- Backend CORS currently allows:
  - `https://axoria.fun`
  - `https://www.axoria.fun`
  - local frontend origins

## Blocking issue before Vercel deploy

### SPA deep-link routing

The app uses `BrowserRouter` in `frontend/src/main.tsx`.

That means direct visits to routes like:

- `/login`
- `/register`
- `/workspaces/:workspaceId/payments/:paymentOrderId`

will 404 on Vercel unless a rewrite sends all non-asset requests to `index.html`.

Claude should add a Vercel rewrite config, for example `frontend/vercel.json`, equivalent to:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

Use judgment to avoid rewriting static asset requests incorrectly, but the deploy must support SPA deep links.

## Important non-blocking issue

### Browser RPC URL is public

`config/frontend.public.json` contains the browser Solana RPC URL.

That value is public once deployed. If it is backed by a paid key, it must be restricted at the provider level or replaced with a public-safe browser RPC.

## Deployment caveat

### Vercel preview domains are not currently allowed by backend CORS

The backend config only allows the production custom domains and local dev.

So:

- production on `axoria.fun` is fine
- temporary preview domains like `*.vercel.app` will hit CORS failures unless backend config is expanded

If Claude wants preview deploys to work, backend CORS must be updated.

## Polish items

These are not blockers for first deploy:

- `frontend/index.html` still uses the title `Stablecoin Ops V2`
- production JS bundle is large (`~1.9 MB` before gzip warning from Vite)

## Recommended deploy sequence

1. Add Vercel SPA rewrite config.
2. Update `frontend/index.html` title/metadata to Axoria branding.
3. Decide whether to keep the current browser RPC URL or swap it for a public-safe one.
4. Deploy frontend to Vercel.
5. Attach `axoria.fun`.
6. Ensure backend is reachable at `https://api.axoria.fun`.
