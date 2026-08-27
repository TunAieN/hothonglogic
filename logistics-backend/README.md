# Hothonglogic Logistics API

Laravel 10 modular-monolith backend for the Hothonglogic logistics platform. Lighthouse exposes the GraphQL contract, Sanctum provides API authentication, and Laravel migrations define the MySQL schema.

## Local development

```bash
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate
php artisan serve
```

## Quality checks

```bash
php artisan test
./vendor/bin/pint --test
```

Do not initialize a current database from the archived SQL file and do not edit migrations that have already run.

See the [root documentation](../README.md) and [backend setup guide](../docs/setup/backend.md) for details.
