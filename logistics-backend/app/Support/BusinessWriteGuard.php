<?php

namespace App\Support;

use App\Exceptions\BusinessWritesLockedException;
use App\Exceptions\FinancialWritesLockedException;

final class BusinessWriteGuard
{
    public static function enabled(): bool
    {
        return config('business.writes_enabled', false) === true;
    }

    public static function financialEnabled(): bool
    {
        return config('business.financial_writes_enabled', false) === true;
    }

    public static function assertEnabled(string $operation): void
    {
        if (! self::enabled()) {
            throw new BusinessWritesLockedException($operation);
        }

        self::assertCurrentTestDatabaseIsSafe();
    }

    public static function assertFinancialEnabled(string $operation): void
    {
        self::assertEnabled($operation);

        if (! self::financialEnabled()) {
            throw new FinancialWritesLockedException($operation);
        }
    }

    private static function assertCurrentTestDatabaseIsSafe(): void
    {
        if (! app()->runningUnitTests() || ! defined('PHPUNIT_COMPOSER_INSTALL')) {
            return;
        }

        $connection = (string) config('database.default');
        DatabaseSafetyGuard::assertSafeTestDatabase(
            $connection,
            config("database.connections.{$connection}.database"),
            config('database.test_database_name'),
            config("database.connections.{$connection}.host"),
            config("database.connections.{$connection}.port"),
            config('database.test_database_host'),
            config('database.test_database_port'),
            config("database.connections.{$connection}.username"),
            config('database.test_database_username'),
        );
    }
}
