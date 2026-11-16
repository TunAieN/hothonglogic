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
    }

    public static function assertFinancialEnabled(string $operation): void
    {
        self::assertEnabled($operation);

        if (! self::financialEnabled()) {
            throw new FinancialWritesLockedException($operation);
        }
    }
}
