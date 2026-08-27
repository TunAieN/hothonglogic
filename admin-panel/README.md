# Hothonglogic Admin Panel

React and TypeScript operations UI for customers, orders, warehouse workflows, payments, invoices, shipping, employees, and reporting. It uses Vite, Refine, Ant Design, and the Laravel Lighthouse GraphQL API.

## Local development

```bash
npm ci
cp .env.example .env
npm run dev
```

Set `VITE_API_BASE_URL` to the Laravel origin, for example `http://127.0.0.1:8000`.

## Quality checks

```bash
npm run lint
npm run build
```

See the [root documentation](../README.md) and [admin setup guide](../docs/setup/admin.md) for system-wide instructions.
