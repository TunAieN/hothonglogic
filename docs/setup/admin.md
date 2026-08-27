# Admin Panel Setup

The admin panel uses React, TypeScript, Vite, Refine, and Ant Design.

```bash
cd admin-panel
npm ci
cp .env.example .env
npm run dev
```

Set `VITE_API_BASE_URL` to the Laravel origin without a trailing `/graphql` path. For example:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Before opening a pull request, run:

```bash
npm run lint
npm run build
```

Production builds are written to `dist/` and should be deployed with an SPA fallback for client-side routes.
