# Backend Setup

The backend is a Laravel 10 application with a Lighthouse GraphQL API and Sanctum authentication.

## Install

```bash
cd logistics-backend
composer install
cp .env.example .env
php artisan key:generate
```

Create an empty MySQL database and update the `DB_*` variables in `.env`. Use a dedicated local user when possible.

```bash
php artisan migrate
php artisan serve
```

The default local GraphQL endpoint is `http://127.0.0.1:8000/graphql`.

## Verify

```bash
php artisan test
./vendor/bin/pint --test
```

Laravel migrations are the schema source of truth. Never initialize a current environment from `docs/legacy/database_schema.sql`, and never edit a migration that has already run in a shared environment.
