<?php

namespace Tests\Unit;

use App\Support\BusinessWriteGuard;
use LogicException;
use Tests\TestCase;

class TestWriteAccessConfigurationTest extends TestCase
{
    public function test_the_verified_test_harness_enables_business_and_financial_writes(): void
    {
        BusinessWriteGuard::assertEnabled('test.verified-business-write');
        BusinessWriteGuard::assertFinancialEnabled('test.verified-financial-write');

        $this->addToAssertionCount(2);
    }

    /**
     * @dataProvider unsafeTargets
     */
    public function test_changing_the_database_after_bootstrap_relocks_test_writes(
        int $port,
        string $database,
    ): void {
        config([
            'database.connections.mysql.port' => $port,
            'database.connections.mysql.database' => $database,
        ]);

        $this->expectException(LogicException::class);
        BusinessWriteGuard::assertEnabled('test.changed-database-target');
    }

    public static function unsafeTargets(): array
    {
        return [
            'production 3310' => [3310, 'logistics_system'],
            'Laragon 3306' => [3306, 'logistics_system_test'],
        ];
    }
}
