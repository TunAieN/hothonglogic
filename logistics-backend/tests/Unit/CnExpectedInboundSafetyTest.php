<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class CnExpectedInboundSafetyTest extends TestCase
{
    public function test_expected_inbound_query_is_read_only_and_authorized(): void
    {
        $root = dirname(__DIR__, 2);
        $resolver = file_get_contents($root.'/app/GraphQL/Resolvers/CnExpectedInboundResolver.php');
        $schema = file_get_contents($root.'/graphql/schema.graphql');

        self::assertStringContainsString("authorize(Auth::user(), 'orders.read')", $resolver);
        self::assertStringContainsString('@permission(requires: "cn_packages.read")', $schema);
        self::assertStringNotContainsString('->create(', $resolver);
        self::assertStringNotContainsString('->update(', $resolver);
        self::assertStringNotContainsString('->delete(', $resolver);
        self::assertStringNotContainsString('DB::transaction', $resolver);
    }

    public function test_received_packages_are_evidence_even_when_unmatched(): void
    {
        $resolver = file_get_contents(dirname(__DIR__, 2).'/app/GraphQL/Resolvers/CnExpectedInboundResolver.php');

        self::assertStringContainsString("->whereNotNull('received_packages.received_at')", $resolver);
        self::assertStringContainsString("UPPER(TRIM(COALESCE(", $resolver);
        self::assertStringContainsString("whereNull('received_packages.order_tracking_id')", $resolver);
        self::assertStringNotContainsString("received_packages.status", $resolver);
    }

    public function test_products_only_come_from_tracking_allocations(): void
    {
        $resolver = file_get_contents(dirname(__DIR__, 2).'/app/GraphQL/Resolvers/CnExpectedInboundResolver.php');

        self::assertStringContainsString("'trackingItems.orderItem'", $resolver);
        self::assertStringContainsString("'allocated' => \$trackingItems->isNotEmpty()", $resolver);
        self::assertStringNotContainsString("'order.items'", $resolver);
    }

    public function test_missing_expected_warehouse_is_reported_honestly(): void
    {
        $resolver = file_get_contents(dirname(__DIR__, 2).'/app/GraphQL/Resolvers/CnExpectedInboundResolver.php');

        self::assertStringContainsString("'warehouse' => null", $resolver);
        self::assertStringNotContainsString("CnWarehouse::query()->first", $resolver);
    }
}
