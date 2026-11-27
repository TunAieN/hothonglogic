<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class ChinaWarehouseReceivingOptionsSafetyTest extends TestCase
{
    public function test_receiving_options_are_filtered_and_never_expose_passwords(): void
    {
        $root = dirname(__DIR__, 2);
        $resolver = file_get_contents($root.'/app/GraphQL/Resolvers/CnPackageResolver.php');
        $schema = file_get_contents($root.'/graphql/chinaWarehouse.graphql');

        self::assertStringContainsString("->where('status', 'active')", $resolver);
        self::assertStringContainsString("\$user->department === 'china_warehouse'", $resolver);
        self::assertStringContainsString("allows(\$user, 'cn_packages.create')", $resolver);
        self::assertStringContainsString("'id', 'name', 'email', 'phone', 'department', 'status', 'role_id'", $resolver);
        self::assertStringNotContainsString('password', $schema);
    }

    public function test_create_uses_active_database_warehouse_and_receiver_ids(): void
    {
        $resolver = file_get_contents(dirname(__DIR__, 2).'/app/GraphQL/Resolvers/CnPackageResolver.php');

        self::assertStringContainsString("empty(\$input['warehouse_id'])", $resolver);
        self::assertStringContainsString("->where('status', 'active')", $resolver);
        self::assertStringContainsString("\$this->resolveReceiver(\$input['receiver_user_id'] ?? null)", $resolver);
        self::assertStringContainsString("'receiver_name' => \$receiver->name", $resolver);
        self::assertStringNotContainsString('firstOrCreate(', $resolver);
    }

    public function test_receiver_migration_is_additive_and_preserves_legacy_snapshot(): void
    {
        $root = dirname(__DIR__, 2);
        $migration = file_get_contents($root.'/database/migrations/2026_11_27_000056_add_receiver_user_to_cn_packages.php');
        $resolver = file_get_contents($root.'/app/GraphQL/Resolvers/CnPackageResolver.php');

        self::assertStringContainsString("foreignId('receiver_user_id')", $migration);
        self::assertStringContainsString('->nullable()', $migration);
        self::assertStringContainsString('->nullOnDelete()', $migration);
        self::assertStringContainsString("\$receiver?->name ?? \$package->receiver_name", $resolver);
        self::assertStringNotContainsString('truncate', strtolower($migration));
    }

    public function test_tracking_matching_rejects_order_codes_and_duplicate_packages(): void
    {
        $resolver = file_get_contents(dirname(__DIR__, 2).'/app/GraphQL/Resolvers/CnPackageResolver.php');
        $policy = file_get_contents(dirname(__DIR__, 2).'/app/Services/Warehouses/China/CnPackageTrackingInputPolicy.php');

        self::assertStringContainsString("OrderTracking::query()", $resolver);
        self::assertStringContainsString("->where('tracking_number', \$trackingNumber)", $resolver);
        self::assertStringContainsString("Order::query()->where('order_code', \$trackingNumber)->exists()", $resolver);
        self::assertStringContainsString('Đây là mã đơn hàng VietTrung, không phải mã vận đơn.', $policy);
        self::assertStringContainsString("->where('tracking_number', \$trackingNumber)", $resolver);
        self::assertStringContainsString('Mã vận đơn đã tồn tại trong kho Trung Quốc.', $policy);
    }

    public function test_create_fails_safely_until_receiver_schema_is_ready(): void
    {
        $resolver = file_get_contents(dirname(__DIR__, 2).'/app/GraphQL/Resolvers/CnPackageResolver.php');

        self::assertStringContainsString("Schema::hasColumn('cn_packages', 'receiver_user_id')", $resolver);
        self::assertStringContainsString('Cấu hình dữ liệu người nhận kho Trung Quốc chưa hoàn tất.', $resolver);
        self::assertStringContainsString('return DB::transaction($callback, 3);', $resolver);
        self::assertStringContainsString("\$sqlState === '23000'", $resolver);
        self::assertStringContainsString('$driverCode === 1062', $resolver);
        self::assertStringContainsString("str_contains(strtolower(\$exception->getMessage()), 'tracking_number')", $resolver);
    }

    public function test_create_schema_requires_the_business_critical_fields(): void
    {
        $schema = file_get_contents(dirname(__DIR__, 2).'/graphql/chinaWarehouse.graphql');
        preg_match('/input CreateCnPackageInput \{(?<body>.*?)\n\}/s', $schema, $match);
        $input = $match['body'] ?? '';

        self::assertStringContainsString('warehouse_id: ID!', $input);
        self::assertStringContainsString('receiver_user_id: ID!', $input);
        self::assertStringContainsString('tracking_number: String!', $input);
        self::assertStringContainsString('weight: Float!', $input);
        self::assertStringContainsString('received_at: DateTime!', $input);
    }

    public function test_cn_package_input_errors_are_graphql_client_safe_and_field_aware(): void
    {
        $root = dirname(__DIR__, 2);
        $exception = file_get_contents($root.'/app/Exceptions/CnPackageInputException.php');
        $resolver = file_get_contents($root.'/app/GraphQL/Resolvers/CnPackageResolver.php');
        $policy = file_get_contents($root.'/app/Services/Warehouses/China/CnPackageTrackingInputPolicy.php');

        self::assertStringContainsString('implements ClientAware, ProvidesExtensions', $exception);
        self::assertStringContainsString('return true;', $exception);
        self::assertStringContainsString("'field' => \$this->field", $exception);
        self::assertStringContainsString("'CN_PACKAGE_ORDER_CODE_NOT_TRACKING'", $policy);
        self::assertStringContainsString("'tracking_number'", $resolver);
    }

    public function test_tracking_validation_query_is_read_only_and_matches_create_rules(): void
    {
        $root = dirname(__DIR__, 2);
        $resolver = file_get_contents($root.'/app/GraphQL/Resolvers/CnPackageResolver.php');
        $schema = file_get_contents($root.'/graphql/schema.graphql');

        self::assertStringContainsString('public function trackingInputValidation', $resolver);
        self::assertStringContainsString("Order::query()->where('order_code', \$trackingNumber)->exists()", $resolver);
        self::assertStringContainsString("->where('tracking_number', \$trackingNumber)", $resolver);
        $queryMethod = substr(
            $resolver,
            strpos($resolver, 'public function trackingInputValidation'),
            strpos($resolver, 'private function normalizeTrackingNumber') - strpos($resolver, 'public function trackingInputValidation'),
        );
        self::assertStringNotContainsString('->create(', $queryMethod);
        self::assertStringContainsString('cnPackageTrackingValidation', $schema);
    }
}
