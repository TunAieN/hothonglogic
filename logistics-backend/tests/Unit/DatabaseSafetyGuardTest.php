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
            'viettrung_qa_runner',
            'viettrung_qa_runner',
        );
        $this->addToAssertionCount(1);
    }

    public function test_it_allows_only_in_memory_sqlite(): void
    {
        DatabaseSafetyGuard::assertSafeTestDatabase('sqlite', ':memory:', 'logistics_system_test');
        $this->addToAssertionCount(1);
    }

    public function test_it_rejects_root_even_on_the_approved_test_endpoint(): void
    {
        $this->expectException(LogicException::class);
        DatabaseSafetyGuard::assertSafeTestDatabase(
            'mysql',
            'logistics_system_test',
            'logistics_system_test',
            '127.0.0.1',
            3311,
            '127.0.0.1',
            3311,
            'root',
            'viettrung_qa_runner',
        );
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

    public function test_it_rejects_the_local_laragon_port_even_with_the_test_database_name(): void
    {
        $this->expectException(LogicException::class);
        DatabaseSafetyGuard::assertSafeTestDatabase(
            'mysql',
            'logistics_system_test',
            'logistics_system_test',
            '127.0.0.1',
            3306,
            '127.0.0.1',
            3306,
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

    public function test_it_allows_destructive_commands_only_on_the_fully_approved_target(): void
    {
        DatabaseSafetyGuard::assertDestructiveCommandAllowed(
            'migrate:fresh',
            'mysql',
            'logistics_system_test',
            'logistics_system_test',
            '127.0.0.1',
            3311,
            '127.0.0.1',
            3311,
            'viettrung_qa_runner',
            'viettrung_qa_runner',
        );
        $this->addToAssertionCount(1);
    }

    public function test_ci_environment_variable_alone_does_not_allow_an_unsafe_database(): void
    {
        putenv('CI=true');

        try {
            $this->expectException(LogicException::class);
            DatabaseSafetyGuard::assertSafeTestDatabase(
                'mysql',
                'logistics_system_test',
                'logistics_system_test',
                '127.0.0.1',
                3306,
                '127.0.0.1',
                3306,
            );
        } finally {
            putenv('CI');
        }
    }

    public function test_testing_environment_alone_does_not_allow_an_unsafe_database(): void
    {
        putenv('APP_ENV=testing');

        try {
            $this->expectException(LogicException::class);
            DatabaseSafetyGuard::assertSafeTestDatabase(
                'mysql',
                'logistics_system_test',
                'logistics_system_test',
                '127.0.0.1',
                3306,
                '127.0.0.1',
                3306,
            );
        } finally {
            putenv('APP_ENV');
        }
    }

    /**
     * @dataProvider destructiveCommands
     */
    public function test_every_destructive_command_is_blocked_outside_the_approved_database(string $command): void
    {
        $this->expectException(LogicException::class);
        DatabaseSafetyGuard::assertDestructiveCommandAllowed(
            $command,
            'mysql',
            'logistics_system_test',
            'logistics_system_test',
            '127.0.0.1',
            3306,
            '127.0.0.1',
            3306,
        );
    }

    public static function destructiveCommands(): array
    {
        return [
            ['db:seed'],
            ['db:wipe'],
            ['migrate:fresh'],
            ['migrate:refresh'],
            ['migrate:reset'],
        ];
    }
}
