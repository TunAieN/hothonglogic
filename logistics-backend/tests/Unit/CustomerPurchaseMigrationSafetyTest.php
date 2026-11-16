<?php

namespace Tests\Unit;

use Tests\TestCase;

class CustomerPurchaseMigrationSafetyTest extends TestCase
{
    public function test_customer_purchase_migration_is_additive_to_existing_business_schema(): void
    {
        $source = file_get_contents(database_path('migrations/2026_11_16_000001_create_customer_purchase_drafts.php'));
        $this->assertStringContainsString("Schema::create('customer_purchase_drafts'", $source);
        $this->assertStringContainsString("Schema::create('customer_purchase_draft_items'", $source);
        $this->assertStringNotContainsString('Schema::table(', $source);
        $this->assertDoesNotMatchRegularExpression('/DB::(?:delete|update|insert|statement)|truncate\s*\(/i', $source);
        $this->assertStringContainsString("constrained('customers')->restrictOnDelete()", $source);
        $this->assertStringContainsString("constrained('orders')->nullOnDelete()", $source);
    }
}
