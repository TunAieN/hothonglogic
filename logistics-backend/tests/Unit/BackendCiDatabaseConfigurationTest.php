<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class BackendCiDatabaseConfigurationTest extends TestCase
{
    private string $workflow;

    protected function setUp(): void
    {
        parent::setUp();

        $path = dirname(__DIR__, 3).'/.github/workflows/backend-ci.yml';
        $workflow = file_get_contents($path);
        $this->assertIsString($workflow);
        $this->workflow = $workflow;
    }

    public function test_ci_uses_a_github_hosted_runner_and_an_isolated_mysql_service(): void
    {
        $this->assertStringContainsString('runs-on: ubuntu-latest', $this->workflow);
        $this->assertStringContainsString('MYSQL_DATABASE: logistics_system_test', $this->workflow);
        $this->assertStringContainsString('MYSQL_USER: viettrung_qa_runner', $this->workflow);
        $this->assertStringContainsString('- 3311:3306', $this->workflow);
    }

    public function test_ci_does_not_use_root_or_production_database_credentials(): void
    {
        $this->assertStringNotContainsString('DB_USERNAME: root', $this->workflow);
        $this->assertStringNotContainsString('MYSQL_ROOT_PASSWORD:', $this->workflow);
        $this->assertStringNotContainsString('DB_PORT: 3310', $this->workflow);
        $this->assertDoesNotMatchRegularExpression('/DB_DATABASE:\s+logistics_system\r?$/m', $this->workflow);
    }

    public function test_composer_and_package_discovery_boot_with_in_memory_sqlite(): void
    {
        $this->assertMatchesRegularExpression(
            '/Install dependencies.*?DB_CONNECTION: sqlite.*?DB_DATABASE: ":memory:"/s',
            $this->workflow,
        );
        $this->assertMatchesRegularExpression(
            '/Verify Laravel package discovery.*?DB_CONNECTION: sqlite.*?DB_DATABASE: ":memory:"/s',
            $this->workflow,
        );
    }
}
