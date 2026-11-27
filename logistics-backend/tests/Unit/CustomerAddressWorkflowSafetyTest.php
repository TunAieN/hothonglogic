<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class CustomerAddressWorkflowSafetyTest extends TestCase
{
    public function test_customer_purchase_requires_owned_address_and_writes_snapshot_inside_transaction(): void
    {
        $root = dirname(__DIR__, 2);
        $controller = file_get_contents($root.'/app/Http/Controllers/CustomerPurchaseController.php');
        $service = file_get_contents($root.'/app/Services/Orders/CustomerPurchaseRequestService.php');

        $this->assertStringContainsString("'customer_address_id' => ['required', 'integer', 'min:1']", $controller);
        $this->assertStringContainsString('findOwnedForUpdate($customerId', $service);
        $this->assertStringContainsString('$deliveryRequest->address()->create([', $service);
        $this->assertStringContainsString("'country_code' => \$selectedAddress->country_code", $service);
        $this->assertStringContainsString("'customer_address_id' => (int) \$input['customer_address_id']", $service);
    }

    public function test_migration_is_additive_and_enforces_one_default_per_customer(): void
    {
        $migration = file_get_contents(dirname(__DIR__, 2).'/database/migrations/2026_11_27_000054_add_customer_order_delivery_address_support.php');

        $this->assertStringContainsString("string('delivery_note', 500)", $migration);
        $this->assertStringContainsString('customer_addresses_one_default_unique', $migration);
        $this->assertStringNotContainsString('dropIfExists', $migration);
    }
}
