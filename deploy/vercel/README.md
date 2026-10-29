# Vercel frontend template

Vercel hosts **only the static frontend**. The API must run on a persistent-disk host; see [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) §8–9.

## Use

1. Copy `vercel.json.template` to the repository root and rename it to `vercel.json`.
2. Replace `REPLACE-WITH-YOUR-API-HOST` with the real HTTPS API origin, e.g. `api.apply.example.org`. Keep the `/api/:path*` suffix.
3. Import the repository into Vercel. Keep the project root at the repository root so npm workspaces resolve.
4. Confirm the build settings from the template: build `npm run build:shared && npm run build -w @esme/web`, output `apps/web/dist`.
5. Add the Vercel production domain to the API configuration:
   - `PUBLIC_APP_URL=https://<vercel-domain>`
   - `TRUSTED_ORIGINS=https://<vercel-domain>`
   - `COOKIE_SAME_SITE=lax`
6. Keep the frontend's API base relative (`VITE_API_BASE_URL=/api/v1`). The rewrite makes API calls same-origin, so the session cookie stays first-party.
7. Deploy and test a real submission, admin sign-in and document download through the Vercel domain.

## Caveats

- **Do not deploy the API on Vercel.** SQLite, private uploads and backups require a persistent filesystem and a single long-running process.
- Vercel's proxy and function body-size limits may be below the application's 5 MB upload default. Test an upload through the deployment; if it fails, lower `MAX_UPLOAD_SIZE_BYTES` within policy or host the frontend on the same server as the API.
- The API is still directly reachable at its own host. Restrict it to the expected origins and keep its health endpoint monitored.
- A custom domain on Vercel is preferable to a preview URL so cookies and CORS configuration stay stable.
