<?php

namespace Tests;

use App\Support\DatabaseSafetyGuard;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;

abstract class TestCase extends BaseTestCase
{
    use CreatesApplication;

    protected function setUp(): void
    {
        parent::setUp();

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

        // Test writes are enabled only after the target has passed the same
        // allowlist used by the application bootstrap and destructive commands.
        config([
            'business.writes_enabled' => true,
            'business.financial_writes_enabled' => true,
        ]);
    }

    protected function assertApprovedMysqlTestConnection(): void
    {
        $this->assertSame('mysql', config('database.default'));
        $this->assertSame('127.0.0.1', config('database.connections.mysql.host'));
        $this->assertSame(3311, (int) config('database.connections.mysql.port'));
        $this->assertSame('logistics_system_test', DB::connection()->getDatabaseName());
        $this->assertSame('viettrung_qa_runner', config('database.connections.mysql.username'));
        $this->assertSame(
            'viettrung_qa_runner',
            DB::selectOne("SELECT SUBSTRING_INDEX(CURRENT_USER(), '@', 1) AS username")->username,
        );

        // GitHub publishes container port 3306 as runner port 3311. A local QA
        // server may listen directly on 3311; neither case permits local 3306.
        $expectedServerPort = getenv('GITHUB_ACTIONS') === 'true' ? 3306 : 3311;
        $this->assertSame($expectedServerPort, (int) DB::selectOne('SELECT @@port AS port')->port);
    }
}
