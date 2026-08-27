# Hothonglogic Logistics Platform

Hothonglogic is a monorepo for a logistics workflow spanning product capture from Taobao/Tmall, order administration, China and Vietnam warehouse operations, payments, invoicing, shipping, and reporting.

The repository contains three applications that are deployed independently but share the same business domain and GraphQL contract. The current structure is intentionally retained while the codebase is cleaned up and modularized incrementally.

## Project Overview

- **Chrome Extension** — Vanilla JavaScript, Chrome Manifest V3; captures product data and starts external orders.
- **Admin Panel** — React, TypeScript, Vite, Refine, and Ant Design; provides the operational user interface.
- **Backend** — Laravel 10, PHP 8.1+, Lighthouse GraphQL, and Sanctum; owns business workflows and persistence.
- **Database** — MySQL. Laravel migrations in `logistics-backend/database/migrations/` are the only schema source of truth.

## Architecture

```text
Taobao/Tmall pages
       │
       ▼
Chrome Extension ───────► Admin Panel ───────► Laravel GraphQL API ───────► MySQL
                             │                         │
                             └──── Sanctum token ─────┘
```

This is a modular monolith, not a microservice architecture. Public routes, GraphQL operations, and database history should remain backward compatible during structural work. See [Architecture overview](docs/architecture/overview.md).

## Folder Structure

```text
.
├── admin-panel/             # React + TypeScript admin application
├── logistics-backend/       # Laravel + Lighthouse GraphQL backend
├── docs/                    # Current setup/architecture docs and archived material
├── extension-src/           # Chrome Extension source and loadable manifest
│   ├── background/          # Service worker
│   ├── content/             # Taobao/Tmall scraper and entrypoint
│   ├── popup/               # Side-panel UI modules
│   ├── login/               # Authentication page
│   ├── api/ auth/ storage/  # GraphQL and local persistence boundaries
│   └── manifest.json        # Chrome Manifest V3 definition
└── scripts/                 # Repository validation helpers
```

The long-term `apps/` layout is documented as a future migration and is not applied during the initial cleanup.

## Tech Stack

| Area | Technology |
| --- | --- |
| Extension | Vanilla JavaScript, HTML, CSS, Chrome Manifest V3 |
| Admin | React 19, TypeScript, Vite, Refine, Ant Design |
| API | Laravel 10, Lighthouse GraphQL, Sanctum |
| Database | MySQL, Laravel migrations |
| Quality | ESLint, TypeScript, PHPUnit, Laravel Pint |

## Requirements

- PHP 8.1 or newer
- Composer 2
- MySQL 8-compatible server
- Node.js `^20.19.0` or `>=22.12.0` (required by the installed Vite version)
- npm
- Google Chrome or another Chromium browser with Manifest V3 support

## Development Setup

Clone the repository, then configure and start the backend and admin panel in separate terminals. Load `extension-src/` as the unpacked extension after reviewing the extension endpoint settings.

```bash
git clone https://github.com/TunAiEN/hothonglogic.git
cd hothonglogic
```

Terminal 1:

```bash
cd logistics-backend
php artisan serve
```

Terminal 2:

```bash
cd admin-panel
npm run dev
```

## Backend Setup

```bash
cd logistics-backend
composer install
cp .env.example .env
php artisan key:generate
```

Create a MySQL database, set the `DB_*` values in `.env`, then run:

```bash
php artisan migrate
php artisan serve
```

Do not import `docs/legacy/database_schema.sql` to initialize a current environment. It is retained only for historical reference.

More detail: [Backend setup](docs/setup/backend.md).

## Frontend Setup

```bash
cd admin-panel
npm ci
cp .env.example .env
npm run dev
```

The Vite development server prints its local URL. Configure `VITE_API_BASE_URL` to point to the Laravel origin; the GraphQL client appends `/graphql`.

More detail: [Admin setup](docs/setup/admin.md).

## Extension Setup

1. Start the backend and admin panel.
2. Open `chrome://extensions/`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select `extension-src/`.
5. Open the extension settings and verify the GraphQL endpoint and admin order URL for the current environment.

The extension remains Vanilla JavaScript. It is not bundled with the admin application. See [Extension setup and validation](docs/setup/extension.md).

## Environment Variables

Never commit a real `.env` file. Copy the provided examples and keep credentials local.

| Application | Variable | Purpose |
| --- | --- | --- |
| Admin | `VITE_API_BASE_URL` | Laravel base URL, for example `http://127.0.0.1:8000` |
| Backend | `APP_URL` | Public backend origin |
| Backend | `APP_KEY` | Generated Laravel application key |
| Backend | `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | MySQL connection |
| Backend | `LIGHTHOUSE_*` | Optional GraphQL cache/security overrides |

Extension development endpoints are stored through `chrome.storage.local`; production packages must be configured with production HTTPS origins and matching `host_permissions`.

## Testing

Admin:

```bash
cd admin-panel
npm run lint
npm run build
```

Backend:

```bash
cd logistics-backend
php artisan test
./vendor/bin/pint --test
```

Extension:

```bash
node --check extension-src/background/background.js
node --check extension-src/content/content.js
node --check extension-src/content/scraper.js
node --check extension-src/login/login.js
node --check extension-src/popup/popup.js
node scripts/validate-extension.mjs
```

Then follow the manual checks in [Extension setup and validation](docs/setup/extension.md).

## Build

Build the admin production assets with:

```bash
cd admin-panel
npm ci
npm run build
```

The output is written to `admin-panel/dist/` and is not committed. The extension ships directly from `extension-src/`; package that directory using the release manifest and production endpoint configuration.

## Git Workflow

- Branch from the intended integration branch and keep changes scoped to one concern.
- Prefer conventional commit prefixes such as `docs:`, `chore:`, `refactor:`, `fix:`, and `ci:`.
- Do not combine folder migrations with business-logic changes.
- Run the checks for every application touched by a commit.
- Never rewrite or delete an applied Laravel migration.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the review checklist.

## Deployment Notes

- Run Laravel migrations as a controlled deployment step; take an appropriate database backup before production migrations.
- Configure production secrets outside Git and run Laravel with `APP_DEBUG=false`.
- Serve the admin build behind HTTPS and set `VITE_API_BASE_URL` at build time.
- Configure the extension with production HTTPS endpoints and limit `host_permissions` to origins it actually calls.
- Clear and rebuild Laravel caches after environment or GraphQL schema changes as required by the deployment platform.
- The archived SQL schema and archived setup documents must not be used as production runbooks.

## License

Proprietary software. See [LICENSE](LICENSE).
