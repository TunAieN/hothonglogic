# Contributing

Keep changes small, explicit, and compatible with the running system.

## Before changing code

- Identify the application and domain affected.
- Add or run tests that protect the current behavior.
- Do not change GraphQL contracts, routes, storage keys, or database structure as part of a cosmetic refactor.
- Do not edit or delete migrations that may already have run.

## Verification

For admin changes, run `npm run lint` and `npm run build` in `admin-panel/`.

For backend changes, run `php artisan test` and `./vendor/bin/pint --test` in `logistics-backend/`.

For extension changes, run `node --check` for every JavaScript entry point and manually test the affected browser flow.

## Commits and review

- Use one concern per commit.
- Separate structural moves from behavior changes.
- Document pre-existing failures instead of weakening tests or lint rules.
- Explain compatibility impact and deployment requirements in the pull request.
