<?php

namespace Tests\Unit;

use App\Support\DatabaseSafetyGuard;
use LogicException;
use PHPUnit\Framework\TestCase;

class DatabaseSafetyGuardTest extends TestCase
{
    public function test_it_allows_the_explicit_mysql_test_database(): void
    {
        DatabaseSafetyGuard::assertSafeTestDatabase(
            'mysql',
            'logistics_system_test',
            'logistics_system_test',
            '127.0.0.1',
            3311,
            '127.0.0.1',
            3311,
        );
        $this->addToAssertionCount(1);
    }

    public function test_it_allows_only_in_memory_sqlite(): void
    {
        DatabaseSafetyGuard::assertSafeTestDatabase('sqlite', ':memory:', 'logistics_system_test');
        $this->addToAssertionCount(1);
    }

    public function test_it_rejects_the_operational_database(): void
    {
        $this->expectException(LogicException::class);
        DatabaseSafetyGuard::assertSafeTestDatabase('mysql', 'logistics_system', 'logistics_system_test');
    }

    public function test_it_rejects_a_mismatched_database_even_when_name_ends_in_test(): void
    {
        $this->expectException(LogicException::class);
        DatabaseSafetyGuard::assertSafeTestDatabase('mysql', 'other_test', 'logistics_system_test');
    }

    public function test_it_rejects_the_production_port_even_with_the_test_database_name(): void
    {
        $this->expectException(LogicException::class);
        DatabaseSafetyGuard::assertSafeTestDatabase(
            'mysql',
            'logistics_system_test',
            'logistics_system_test',
            '127.0.0.1',
            3310,
            '127.0.0.1',
            3311,
        );
    }

    public function test_it_rejects_a_non_loopback_host(): void
    {
        $this->expectException(LogicException::class);
        DatabaseSafetyGuard::assertSafeTestDatabase(
            'mysql',
            'logistics_system_test',
            'logistics_system_test',
            '192.0.2.10',
            3311,
            '127.0.0.1',
            3311,
        );
    }

    public function test_it_blocks_destructive_commands_on_non_test_databases(): void
    {
        $this->expectException(LogicException::class);
        DatabaseSafetyGuard::assertDestructiveCommandAllowed('migrate:fresh', 'mysql', 'logistics_system', 'logistics_system_test');
    }

    public function test_it_blocks_seeding_on_non_test_databases(): void
    {
        $this->expectException(LogicException::class);
        DatabaseSafetyGuard::assertDestructiveCommandAllowed('db:seed', 'mysql', 'logistics_system', 'logistics_system_test');
    }
}
