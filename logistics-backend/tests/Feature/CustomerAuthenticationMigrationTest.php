<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class CustomerAuthenticationMigrationTest extends TestCase
{
    public function test_customer_authentication_migration_can_roll_back_cleanly(): void
    {
        if (config('database.default') !== 'sqlite') {
            $this->markTestSkipped('Migration safety test requires an explicitly isolated SQLite database.');
        }
        Schema::create('customers', function (Blueprint $table) {
            $table->id();
        });
        $migration = require database_path('migrations/2026_11_14_000000_create_customer_authentication_tables.php');
        $migration->up();
        $this->assertTrue(Schema::hasTable('customer_accounts'));
        $this->assertTrue(Schema::hasTable('customer_password_reset_tokens'));
        $migration->down();
        $this->assertFalse(Schema::hasTable('customer_accounts'));
        $this->assertTrue(Schema::hasTable('customers'));
    }
}
