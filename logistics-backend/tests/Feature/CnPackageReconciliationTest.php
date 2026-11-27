<?php

namespace Tests\Feature;

use App\Exceptions\CnPackageInputException;
use App\GraphQL\Resolvers\CnBatchResolver;
use App\GraphQL\Resolvers\CnExpectedInboundResolver;
use App\GraphQL\Resolvers\CnPackageResolver;
use App\GraphQL\Resolvers\CnTrackingPurchaseLinkResolver;
use App\GraphQL\Resolvers\OrderResolver;
use App\Models\AuditLog;
use App\Models\CnPackage;
use App\Models\Order;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Nuwave\Lighthouse\Schema\Types\Scalars\DateTime;
use ReflectionMethod;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class CnPackageReconciliationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['database.default' => 'sqlite', 'database.connections.sqlite.database' => ':memory:']);
        DB::purge('sqlite');
        $this->assertSame(':memory:', DB::connection()->getDatabaseName());

        foreach ([
            'roles' => 'id INTEGER PRIMARY KEY, permissions TEXT',
            'users' => 'id INTEGER PRIMARY KEY, role_id INTEGER, name TEXT, status TEXT, department TEXT',
            'customers' => 'id INTEGER PRIMARY KEY, name TEXT, code TEXT',
            'orders' => 'id INTEGER PRIMARY KEY, customer_id INTEGER, order_code TEXT, status TEXT, updated_at TEXT',
            'order_items' => 'id INTEGER PRIMARY KEY, order_id INTEGER, quantity INTEGER, price_cny DECIMAL(8, 2), product_name TEXT',
            'order_trackings' => 'id INTEGER PRIMARY KEY, order_id INTEGER, tracking_number TEXT UNIQUE, declared_value REAL, status TEXT, carrier TEXT, dispatched_at TEXT, note TEXT, created_at TEXT, updated_at TEXT',
            'order_tracking_items' => 'id INTEGER PRIMARY KEY, order_tracking_id INTEGER, order_item_id INTEGER, quantity INTEGER, created_at TEXT, updated_at TEXT',
            'taobao_purchase_orders' => 'id INTEGER PRIMARY KEY, order_id INTEGER, external_order_code TEXT, shop_name TEXT, shop_id TEXT, status TEXT',
            'taobao_purchase_order_trackings' => 'taobao_purchase_order_id INTEGER, order_tracking_id INTEGER, linked_by INTEGER, created_at TEXT, updated_at TEXT',
            'taobao_purchase_order_items' => 'id INTEGER PRIMARY KEY, taobao_purchase_order_id INTEGER, order_item_id INTEGER, quantity INTEGER',
            'cn_warehouses' => 'id INTEGER PRIMARY KEY, name TEXT, status TEXT, code TEXT',
            'cn_packages' => 'id INTEGER PRIMARY KEY, warehouse_id INTEGER, receiver_user_id INTEGER, receiver_name TEXT, created_by INTEGER, tracking_number TEXT UNIQUE, order_id INTEGER, order_tracking_id INTEGER, declared_value REAL, weight REAL, actual_length REAL, actual_width REAL, actual_height REAL, volume REAL, volumetric_weight REAL, chargeable_weight REAL, carrier TEXT, package_condition TEXT, status TEXT, note TEXT, received_at TEXT, created_at TEXT, updated_at TEXT',
            'cn_package_items' => 'id INTEGER PRIMARY KEY, cn_package_id INTEGER, order_item_id INTEGER, quantity INTEGER, created_at TEXT, updated_at TEXT',
            'cn_batch_packages' => 'id INTEGER PRIMARY KEY, cn_package_id INTEGER UNIQUE, cn_batch_id INTEGER, created_at TEXT, updated_at TEXT',
            'cn_batches' => 'id INTEGER PRIMARY KEY, warehouse_id INTEGER, batch_code TEXT UNIQUE, destination_warehouse_name TEXT, status TEXT, shipping_type TEXT, expected_arrival_at TEXT, note TEXT, total_packages INTEGER, total_weight REAL, created_at TEXT, updated_at TEXT',
            'vn_warehouses' => 'id INTEGER PRIMARY KEY, code TEXT, name TEXT, address TEXT',
            'vn_packages' => 'id INTEGER PRIMARY KEY, cn_package_id INTEGER',
            'audit_logs' => 'id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT, entity_type TEXT, entity_id INTEGER, before_data TEXT, after_data TEXT, ip TEXT, user_agent TEXT, created_at TEXT',
        ] as $table => $definition) {
            DB::statement("CREATE TABLE {$table} ({$definition})");
        }

        DB::table('roles')->insert(['id' => 1, 'permissions' => '["all"]']);
        DB::table('users')->insert([
            ['id' => 1, 'role_id' => 1, 'name' => 'Input operator', 'status' => 'active', 'department' => 'china_warehouse'],
            ['id' => 2, 'role_id' => 1, 'name' => 'Actual receiver', 'status' => 'active', 'department' => 'china_warehouse'],
        ]);
        $this->actingAs(User::query()->findOrFail(1));
        DB::table('cn_warehouses')->insert(['id' => 7, 'name' => 'CN test', 'status' => 'active']);
        DB::table('customers')->insert(['id' => 1, 'name' => 'Fixture buyer', 'code' => 'BUYER']);
        DB::table('orders')->insert(['id' => 5, 'customer_id' => 1, 'order_code' => 'REQ-FIXTURE', 'status' => 'waiting_cn_warehouse']);
        DB::table('order_trackings')->insert([
            ['id' => 1, 'order_id' => 5, 'tracking_number' => 'YT-EXPECTED', 'status' => 'pending'],
            ['id' => 2, 'order_id' => 5, 'tracking_number' => 'YT-CORRECT', 'status' => 'pending'],
        ]);
        DB::table('taobao_purchase_orders')->insert([
            ['id' => 1, 'order_id' => 5, 'external_order_code' => 'TB-FIXTURE', 'shop_name' => 'Fixture shop'],
            ['id' => 2, 'order_id' => 5, 'external_order_code' => 'TB-SECOND', 'shop_name' => 'Second shop'],
        ]);
        DB::table('taobao_purchase_order_trackings')->insert([
            ['taobao_purchase_order_id' => 1, 'order_tracking_id' => 1],
            ['taobao_purchase_order_id' => 2, 'order_tracking_id' => 1],
            ['taobao_purchase_order_id' => 2, 'order_tracking_id' => 2],
        ]);
    }

    public function test_batch_destination_catalog_and_atomic_membership(): void
    {
        DB::table('vn_warehouses')->insert(['id' => 1, 'code' => 'VN-FIX', 'name' => 'Fixture destination']);
        DB::table('cn_batches')->insert(['id' => 10, 'warehouse_id' => 7, 'batch_code' => 'LEGACY',
            'destination_warehouse_name' => 'Historic warehouse', 'status' => 'pending', 'note' => 'retain legacy']);
        $migration = require database_path('migrations/2026_11_28_000058_add_cn_batch_destination_warehouse.php');
        $migration->up();
        DB::table('vn_warehouses')->insert(['id' => 2, 'code' => 'OFF', 'name' => 'Inactive warehouse', 'status' => 'inactive']);
        DB::table('cn_warehouses')->where('id', 7)->update(['code' => 'QC']);
        DB::table('cn_packages')->insert([
            ['id' => 1, 'warehouse_id' => 7, 'tracking_number' => 'A', 'weight' => 4.25, 'status' => 'matched', 'received_at' => now()],
            ['id' => 2, 'warehouse_id' => 7, 'tracking_number' => 'B', 'weight' => 2.5, 'status' => 'matched', 'received_at' => now()],
        ]);
        DB::table('cn_package_items')->insert([
            ['cn_package_id' => 1, 'quantity' => 1], ['cn_package_id' => 2, 'quantity' => 1],
        ]);
        $resolver = app(CnBatchResolver::class);
        $catalog = $resolver->receivingOptions(null, ['warehouse_id' => 7]);
        $this->assertEquals([1], $catalog['destinations']->pluck('id')->all());
        $this->assertEquals('Historic warehouse', $resolver->show(null, ['id' => 10])->destination_warehouse_name);
        $this->assertNull($resolver->show(null, ['id' => 10])->destination_warehouse_id);
        foreach ([999, 2] as $destination) {
            try {
                $resolver->addPackages(null, ['input' => ['cn_package_ids' => [1], 'destination_warehouse_id' => $destination]]);
                $this->fail('Destination must exist and be active.');
            } catch (CnPackageInputException $error) {
                $this->assertSame('destination_warehouse_id', $error->field);
            }
        }
        $this->assertDatabaseCount('cn_batches', 1);
        $batch = $resolver->addPackages(null, ['input' => ['cn_package_ids' => [1], 'destination_warehouse_id' => 1,
            'shipping_type' => 'fast', 'expected_arrival_at' => '2027-01-12 00:00:00', 'note' => 'original note']]);
        $this->assertSame('pending', $batch->status);
        $this->assertSame($catalog['preview_code'], $batch->batch_code);
        $this->assertEquals(1, $batch->destination_warehouse_id);
        $this->assertSame('Fixture destination', $batch->destinationWarehouse->name);
        $this->assertSame('2027-01-12', $batch->expected_arrival_at->toDateString());
        $updated = $resolver->addPackages(null, ['input' => ['cn_package_ids' => [2], 'cn_batch_id' => $batch->id,
            'destination_warehouse_id' => 2, 'note' => 'must not replace original']]);
        $this->assertEquals(1, $updated->destination_warehouse_id);
        $this->assertEquals(2, $updated->total_packages);
        $this->assertEquals(6.75, $updated->total_weight);
        $this->assertSame('original note', $updated->note);
        $this->assertDatabaseCount('cn_batch_packages', 2);
        Sanctum::actingAs(User::query()->findOrFail(1), ['*'], 'api');
        $this->postJson('/graphql', ['query' => '{ cnBatchesForPackages(warehouse_id: "7", search: "original", first: 1) {
            data { batch_code destination_warehouse { name } } paginatorInfo { total } } }'])
            ->assertOk()->assertJsonPath('data.cnBatchesForPackages.paginatorInfo.total', 1)
            ->assertJsonPath('data.cnBatchesForPackages.data.0.destination_warehouse.name', 'Fixture destination');
        $this->expectExceptionMessage('Một hoặc nhiều kiện đã thuộc lô hoặc đã nhập kho Việt Nam.');
        $resolver->addPackages(null, ['input' => ['cn_package_ids' => [1], 'destination_warehouse_id' => 1]]);
    }

    public function test_batch_write_rechecks_eligibility_and_rolls_back_the_whole_batch(): void
    {
        $migration = require database_path('migrations/2026_11_28_000058_add_cn_batch_destination_warehouse.php');
        $migration->up();
        DB::table('vn_warehouses')->insert(['id' => 1, 'code' => 'VN-FIX', 'name' => 'Fixture destination']);
        DB::table('cn_warehouses')->where('id', 7)->update(['code' => 'QC']);
        DB::table('cn_packages')->insert([
            ['id' => 1, 'warehouse_id' => 7, 'tracking_number' => 'A', 'weight' => 1, 'status' => 'matched', 'received_at' => now()],
            ['id' => 2, 'warehouse_id' => 7, 'tracking_number' => 'B', 'weight' => 1, 'status' => 'matched', 'received_at' => now()],
            ['id' => 3, 'warehouse_id' => 8, 'tracking_number' => 'C', 'weight' => 1, 'status' => 'matched', 'received_at' => now()],
            ['id' => 4, 'warehouse_id' => 7, 'tracking_number' => 'D', 'weight' => 1, 'status' => 'matched', 'received_at' => now()],
        ]);
        DB::table('cn_package_items')->insert([
            ['cn_package_id' => 1, 'quantity' => 1], ['cn_package_id' => 2, 'quantity' => 1], ['cn_package_id' => 3, 'quantity' => 1],
        ]);
        DB::table('cn_batches')->insert([
            ['id' => 10, 'warehouse_id' => 7, 'batch_code' => 'LOCKED', 'status' => 'exporting'],
            ['id' => 11, 'warehouse_id' => 8, 'batch_code' => 'OTHER', 'status' => 'pending'],
        ]);
        $resolver = app(CnBatchResolver::class);
        $this->assertSame(['LOCKED'], $resolver->listForPackages(null, ['warehouse_id' => 7, 'status' => 'all'])->pluck('batch_code')->all());
        $this->assertEmpty($resolver->listForPackages(null, ['warehouse_id' => 7])->get());
        foreach ([
            [['cn_package_ids' => [1, 3]], 'cùng một kho'],
            [['cn_package_ids' => [4]], 'xác nhận sản phẩm'],
            [['cn_package_ids' => [1], 'cn_batch_id' => 10], 'không còn nhận'],
            [['cn_package_ids' => [1], 'cn_batch_id' => 11], 'kho Trung Quốc khác'],
        ] as [$input, $message]) {
            try {
                $resolver->addPackages(null, ['input' => $input]);
                $this->fail('Ineligible batch selection should fail.');
            } catch (CnPackageInputException $error) {
                $this->assertStringContainsString($message, $error->getMessage());
            }
        }
        DB::unprepared("CREATE TRIGGER reject_second_package BEFORE INSERT ON cn_batch_packages WHEN NEW.cn_package_id=2 BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
        try {
            $resolver->addPackages(null, ['input' => ['cn_package_ids' => [1, 2], 'destination_warehouse_id' => 1]]);
            $this->fail('Expected second attachment to fail.');
        } catch (QueryException) {
            $this->assertDatabaseCount('cn_batch_packages', 0);
            $this->assertDatabaseCount('cn_batches', 2);
        }
    }

    public function test_dispatch_revalidates_review_and_records_only_one_handover(): void
    {
        (require database_path('migrations/2026_11_28_000058_add_cn_batch_destination_warehouse.php'))->up();
        foreach (['departed_at', 'handed_over_at', 'handed_over_by', 'packaging_type', 'transport_container_count',
            'actual_batch_weight', 'package_material_weight', 'actual_length', 'actual_width', 'actual_height',
            'actual_volume', 'carrier_name', 'transport_code', 'route_name', 'vehicle_plate', 'driver_name',
            'driver_phone', 'freight_cost', 'dispatch_snapshot', 'dispatch_note'] as $column) {
            DB::statement("ALTER TABLE cn_batches ADD COLUMN {$column} TEXT");
        }
        DB::table('vn_warehouses')->insert(['id' => 1, 'code' => 'VN', 'name' => 'Kho Việt Nam']);
        DB::table('cn_batches')->insert(['id' => 10, 'warehouse_id' => 7, 'batch_code' => 'DISPATCH', 'status' => 'pending']);
        DB::table('cn_batches')->insert(['id' => 11, 'warehouse_id' => 8, 'batch_code' => 'OTHER', 'status' => 'pending']);
        DB::table('cn_packages')->insert(['id' => 7, 'warehouse_id' => 7, 'tracking_number' => 'READY', 'weight' => 2,
            'status' => 'matched', 'received_at' => now(), 'package_condition' => 'other']);
        DB::table('cn_package_items')->insert(['cn_package_id' => 7, 'quantity' => 1]);
        DB::table('cn_batch_packages')->insert(['cn_batch_id' => 10, 'cn_package_id' => 7]);
        config(['cn_warehouse.batch_warehouse_assignments' => [1 => [7]]]);
        $resolver = app(CnBatchResolver::class);
        $this->assertSame(['DISPATCH'], $resolver->list()->pluck('batch_code')->all());
        $review = $resolver->dispatchReview(null, ['id' => 10]);
        $this->assertSame([], $review['packages'][0]['issues']);
        $this->assertNotEmpty($review['packages'][0]['warnings']);
        $this->assertFalse($review['destination_ready']);
        $input = [
            'review_version' => $review['version'], 'reviewed_package_ids' => [7], 'review_confirmed' => true,
            'destination_warehouse_id' => 1, 'shipping_type' => 'normal', 'packaging_type' => 'bag',
            'transport_container_count' => 1, 'actual_batch_weight' => 2, 'actual_length' => 25,
            'actual_width' => 25, 'actual_height' => 25, 'carrier_name' => 'Fixture carrier',
            'departed_at' => now()->subMinute()->toDateTimeString(),
            'expected_arrival_at' => now()->addDays(3)->toDateTimeString(),
        ];
        foreach ([
            [11, [], 'không có quyền'],
            [10, ['review_version' => 'stale'], 'đã thay đổi'],
            [10, ['review_confirmed' => false], 'xác nhận danh sách kiện'],
            [10, ['reviewed_package_ids' => []], 'rà soát từng kiện'],
            [10, ['destination_warehouse_id' => 999], 'Kho nhận Việt Nam'],
        ] as [$id, $override, $expected]) {
            try {
                $resolver->dispatch(null, ['id' => $id, 'input' => array_replace($input, $override)]);
                $this->fail('Dispatch must validate current data and account scope.');
            } catch (CnPackageInputException $failure) {
                $this->assertStringContainsString($expected, $failure->getMessage());
            }
        }
        DB::table('roles')->insert(['id' => 2, 'permissions' => '["cn_batches.read"]']);
        DB::table('users')->where('id', 2)->update(['role_id' => 2]);
        Sanctum::actingAs(User::query()->findOrFail(2), ['*'], 'api');
        $this->postJson('/graphql', [
            'query' => 'mutation($input: DispatchCnBatchInput!) { dispatchCnBatch(id: "10", input: $input) { status } }',
            'variables' => ['input' => $input],
        ])->assertOk()->assertJsonPath('errors.0.message', 'Bạn không có quyền thực hiện thao tác này.');
        Sanctum::actingAs(User::query()->findOrFail(1), ['*'], 'api');
        DB::unprepared("CREATE TRIGGER reject_dispatch_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'fixture audit failure'); END");
        try {
            $resolver->dispatch(null, ['id' => 10, 'input' => $input]);
            $this->fail('A failed audit must roll back the handover.');
        } catch (QueryException) {
            $this->assertDatabaseHas('cn_batches', ['id' => 10, 'status' => 'pending', 'handed_over_at' => null]);
            $this->assertDatabaseCount('audit_logs', 0);
        }
        DB::statement('DROP TRIGGER reject_dispatch_audit');
        $saved = $resolver->dispatch(null, ['id' => 10, 'input' => $input]);
        $this->assertSame('exporting', $saved->status);
        $this->assertEquals(1, $saved->handed_over_by);
        $this->assertNotNull($saved->handed_over_at);
        $this->assertSame(['7'], $saved->dispatch_snapshot['item_reviewed_package_ids']);
        $this->assertDatabaseHas('audit_logs', ['user_id' => 1, 'action' => 'cn_batch_dispatched', 'entity_id' => 10]);
        $this->assertDatabaseCount('vn_packages', 0);
        $this->assertDatabaseCount('cn_batch_packages', 1);
        $this->expectExceptionMessage('Chỉ lô đang chờ xuất kho');
        $resolver->dispatch(null, ['id' => 10, 'input' => $input]);
    }

    public function test_expected_receipt_disappears_and_second_operator_sees_existing_package(): void
    {
        $expected = app(CnExpectedInboundResolver::class);
        $this->assertCount(2, $expected->list(null, [])['data']);
        $resolver = app(CnPackageResolver::class);
        $input = $this->receipt(' yt-expected ') + ['expected_tracking_id' => '1', 'expected_order_id' => '5'];
        $package = $resolver->create(null, ['input' => $input]);
        $this->assertSame('matched', $package->status);
        $this->assertEquals(1, $package->created_by);
        $this->assertEquals(2, $package->receiver_user_id);
        $this->assertEmpty($package->packageItems);
        $this->assertNull($package->currentBatchPackage);
        $this->assertSame(['YT-CORRECT'], array_column($expected->list(null, [])['data'], 'tracking_number'));
        $this->assertEquals($package->id, $resolver->trackingInputValidation(null, ['tracking_number' => 'YT-EXPECTED'])['existing_package_id']);
        $this->expectExceptionMessage('Mã vận đơn đã tồn tại trong kho Trung Quốc.');
        $resolver->create(null, ['input' => $input]);
    }

    public function test_create_graphql_distinguishes_tracking_preview_validation_and_committed_receipt(): void
    {
        Sanctum::actingAs(User::query()->findOrFail(1), ['*'], 'api');
        $this->postJson('/graphql', [
            'query' => '{ cnPackageTrackingValidation(tracking_number: "YT-EXPECTED") { valid matched existing_package_id } }',
        ])->assertOk()
            ->assertJsonPath('data.cnPackageTrackingValidation.valid', true)
            ->assertJsonPath('data.cnPackageTrackingValidation.matched', true)
            ->assertJsonPath('data.cnPackageTrackingValidation.existing_package_id', null);
        $this->assertDatabaseCount('cn_packages', 0);

        $mutation = 'mutation ReceiveCnPackage($input: CreateCnPackageInput!) { createCnPackage(input: $input) { id } }';
        $input = $this->receipt('YT-EXPECTED') + ['status' => 'matched'];
        $submit = fn (array $values) => $this->postJson('/graphql', ['query' => $mutation, 'variables' => ['input' => $values]]);
        $submit(array_replace($input, ['weight' => 0]))->assertOk()
            ->assertJsonPath('data.createCnPackage', null)
            ->assertJsonPath('errors.0.extensions.status', 422)
            ->assertJsonPath('errors.0.extensions.field', 'weight');
        $this->assertDatabaseCount('cn_packages', 0);

        $created = $submit($input)->assertOk()->assertJsonMissingPath('errors')->json('data.createCnPackage.id');
        $this->assertNotEmpty($created);
        $submit($input)->assertOk()
            ->assertJsonPath('data.createCnPackage', null)
            ->assertJsonPath('errors.0.extensions.code', 'CN_PACKAGE_DUPLICATE_TRACKING')
            ->assertJsonPath('errors.0.extensions.status', 409);
        $this->assertDatabaseCount('cn_packages', 1);
    }

    public function test_create_compares_receipt_instants_in_utc_across_local_midnight(): void
    {
        $resolver = app(CnPackageResolver::class);
        $scalar = new DateTime;
        try {
            Carbon::setTestNow(Carbon::parse('2026-11-27 23:30:00', 'Asia/Ho_Chi_Minh'));
            $package = $resolver->create(null, ['input' => array_replace($this->receipt('YT-EXPECTED'), [
                'received_at' => $scalar->parseValue('2026-11-27 16:29:00'),
            ])]);
            $this->assertSame('2026-11-27 16:29:00', $scalar->serialize($package->received_at));

            Carbon::setTestNow(Carbon::parse('2026-11-28 00:00:00', 'Asia/Shanghai'));
            foreach (['2026-11-27 15:59:59', '2026-11-27 16:00:00'] as $index => $receivedAt) {
                $package = $resolver->create(null, ['input' => array_replace($this->receipt("YT-MIDNIGHT-{$index}"), [
                    'received_at' => $scalar->parseValue($receivedAt),
                    'note' => 'Fixture handover',
                ])]);
                $this->assertSame($receivedAt, $scalar->serialize($package->received_at));
            }
            try {
                $resolver->create(null, ['input' => array_replace($this->receipt('YT-CORRECT'), [
                    'received_at' => $scalar->parseValue('2026-11-27 16:00:01'),
                ])]);
                $this->fail('A receipt one second in the future must be rejected.');
            } catch (CnPackageInputException $exception) {
                $this->assertSame('received_at', $exception->field);
                $this->assertSame('Thời gian nhận hàng không được ở tương lai.', $exception->getMessage());
            }
            $this->assertDatabaseCount('cn_packages', 3);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_unmatched_package_is_audited_and_reconciled_using_verified_tracking_only(): void
    {
        $resolver = app(CnPackageResolver::class);
        $package = $resolver->create(null, ['input' => $this->receipt('YT-TYPO') + ['note' => 'Handover record']]);
        $this->assertSame('unmatched', $package->status);
        $this->assertNull($package->order_id);
        $this->assertSame('REQ-FIXTURE', $resolver->reconciliationOrders(null, ['search' => 'TB-FIXTURE'])[0]['order_code']);
        $package = $resolver->update(null, ['id' => $package->id, 'input' => ['reconciliation' => [
            'original_tracking_number' => 'YT-TYPO', 'original_note' => 'Handover record',
            'verified_tracking_number' => 'YT-CORRECT', 'reason' => 'Compared original label',
        ]]]);
        $this->assertSame('matched', $package->status);
        $this->assertEquals(2, $package->order_tracking_id);
        $this->assertEmpty($package->packageItems);
        $audit = AuditLog::query()->sole();
        $this->assertEquals(1, $audit->user_id);
        $this->assertSame('YT-TYPO', $audit->before_data['tracking_number']);
        $this->assertSame('YT-CORRECT', $audit->after_data['tracking_number']);
        $this->assertSame('Compared original label', $audit->after_data['reason']);
    }

    public function test_failed_audit_rolls_back_the_code_and_order_link(): void
    {
        $resolver = app(CnPackageResolver::class);
        $package = $resolver->create(null, ['input' => $this->receipt('YT-TYPO') + ['note' => 'Evidence']]);
        DB::unprepared("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'fixture audit failure'); END");
        try {
            $resolver->update(null, ['id' => $package->id, 'input' => ['reconciliation' => [
                'original_tracking_number' => 'YT-TYPO', 'original_note' => 'Evidence',
                'verified_tracking_number' => 'YT-CORRECT', 'reason' => 'Verified label',
            ]]]);
            $this->fail('Expected the audit insert to fail.');
        } catch (QueryException) {
            $current = CnPackage::query()->findOrFail($package->id);
            $this->assertSame('YT-TYPO', $current->tracking_number);
            $this->assertNull($current->order_id);
            $this->assertSame('unmatched', $current->status);
        }
    }

    public function test_unknown_tracking_requires_handover_note(): void
    {
        $this->expectException(CnPackageInputException::class);
        app(CnPackageResolver::class)->create(null, ['input' => $this->receipt('YT-UNKNOWN')]);
    }

    public function test_unmatched_with_batch_allows_notes_but_rejects_code_change(): void
    {
        $resolver = app(CnPackageResolver::class);
        $package = $resolver->create(null, ['input' => $this->receipt('YT-TYPO') + ['note' => 'Evidence']]);
        DB::table('cn_batches')->insert(['id' => 2, 'warehouse_id' => 7]);
        DB::table('cn_batch_packages')->insert(['cn_package_id' => $package->id, 'cn_batch_id' => 2]);
        $update = [
            'original_tracking_number' => 'YT-TYPO', 'original_note' => 'Evidence',
            'reason' => 'Supplier cannot verify', 'note' => 'Awaiting confirmation',
        ];
        $saved = $resolver->update(null, ['id' => $package->id, 'input' => ['reconciliation' => $update]]);
        $this->assertSame('unmatched', $saved->status);
        $this->assertSame('Awaiting confirmation', $saved->note);
        $this->expectException(CnPackageInputException::class);
        $resolver->update(null, ['id' => $package->id, 'input' => [
            'reconciliation' => array_replace($update, ['original_note' => $saved->note, 'verified_tracking_number' => 'YT-CORRECT']),
        ]]);
    }

    public function test_stale_expected_link_is_not_received(): void
    {
        $this->expectExceptionMessage('Tracking dự kiến đã thay đổi.');
        app(CnPackageResolver::class)->create(null, ['input' => $this->receipt('YT-EXPECTED') + ['expected_tracking_id' => 2]]);
    }

    public function test_inspection_splits_one_sku_across_packages_and_records_excess_as_exception(): void
    {
        DB::table('order_items')->insert(['id' => 20, 'order_id' => 5, 'quantity' => 10, 'price_cny' => 8]);
        DB::table('taobao_purchase_order_trackings')->delete();
        $resolver = app(CnPackageResolver::class);
        $first = $resolver->create(null, ['input' => $this->receipt('YT-EXPECTED')]);
        $second = $resolver->create(null, ['input' => $this->receipt('YT-CORRECT')]);
        $this->assertSame('matched', $first->status);
        $resolver->confirmItems(null, ['package_id' => $first->id, 'items' => [['order_item_id' => 20, 'quantity' => 4]], 'expected_items' => []]);
        try {
            $resolver->confirmItems(null, ['package_id' => $second->id, 'items' => [['order_item_id' => 20, 'quantity' => 7]]]);
            $this->fail('Expected the cumulative limit to reject excess.');
        } catch (CnPackageInputException $exception) {
            $this->assertStringContainsString('6 đơn vị', $exception->getMessage());
        }
        $resolver->confirmItems(null, ['package_id' => $second->id, 'items' => [['order_item_id' => 20, 'quantity' => 6]], 'inspection_note' => 'One extra unit held for review']);
        $resolver->confirmItems(null, ['package_id' => $second->id, 'items' => [], 'inspection_note' => 'Extra unit reported to buyer']);
        $this->assertEquals(10, DB::table('cn_package_items')->sum('quantity'));
        $this->assertEquals(6, DB::table('order_tracking_items')->where('order_tracking_id', 2)->value('quantity'));
        $this->assertDatabaseCount('taobao_purchase_order_trackings', 0);
        $this->assertDatabaseCount('audit_logs', 2);
    }

    public function test_verification_updates_only_links_with_audit_and_rejects_stale_or_foreign_choices(): void
    {
        DB::table('order_items')->insert(['id' => 20, 'order_id' => 5, 'quantity' => 10, 'price_cny' => 8, 'product_name' => 'SKU A']);
        DB::table('taobao_purchase_order_items')->insert([
            ['taobao_purchase_order_id' => 1, 'order_item_id' => 20, 'quantity' => 6],
            ['taobao_purchase_order_id' => 2, 'order_item_id' => 20, 'quantity' => 4],
        ]);
        DB::table('taobao_purchase_orders')->insert(['id' => 3, 'order_id' => 6, 'external_order_code' => 'OTHER']);
        $resolver = app(CnPackageResolver::class);
        $package = $resolver->create(null, ['input' => $this->receipt('YT-EXPECTED')]);
        $resolver->confirmItems(null, ['package_id' => $package->id, 'items' => [['order_item_id' => 20, 'quantity' => 5]]]);
        $verification = app(CnTrackingPurchaseLinkResolver::class);
        $view = $verification->show(null, ['package_id' => $package->id]);
        $this->assertCount(2, $view['purchases']);
        $this->assertEquals(5, $view['inspected_items'][0]['quantity']);
        $input = [
            'package_id' => $package->id, 'tracking_id' => 1,
            'expected_purchase_ids' => [1, 2], 'purchase_ids' => [1, 1], 'reason' => 'Confirmed with seller handover',
        ];
        $this->assertSame(['1'], $verification->update(null, ['input' => $input])['purchase_ids']);
        $audit = AuditLog::query()->sole();
        $this->assertSame(['2'], $audit->after_data['removed']);
        $this->assertEquals(5, $package->packageItems()->sum('quantity'));
        $this->assertDatabaseCount('order_trackings', 2);
        $this->assertEquals(5, DB::table('order_tracking_items')->sum('quantity'));
        $this->assertEquals(10, DB::table('taobao_purchase_order_items')->sum('quantity'));
        foreach ([
            [$input, 'người khác cập nhật'],
            [array_replace($input, ['expected_purchase_ids' => [1], 'purchase_ids' => [3]]), 'đúng đơn VietTrung'],
        ] as [$invalid, $message]) {
            try {
                $verification->update(null, ['input' => $invalid]);
                $this->fail('Expected verification to be refused.');
            } catch (CnPackageInputException $exception) {
                $this->assertStringContainsString($message, $exception->getMessage());
            }
        }
        $this->assertDatabaseCount('audit_logs', 1);
    }

    public function test_order_tracking_sync_keeps_receipt_evidence_and_accepts_tracking_without_purchase(): void
    {
        DB::table('order_items')->insert(['id' => 20, 'order_id' => 5, 'quantity' => 10, 'price_cny' => 8]);
        $warehouse = app(CnPackageResolver::class);
        $package = $warehouse->create(null, ['input' => $this->receipt('YT-EXPECTED')]);
        $warehouse->confirmItems(null, ['package_id' => $package->id, 'items' => [['order_item_id' => 20, 'quantity' => 4]]]);
        $sync = new ReflectionMethod(OrderResolver::class, 'syncOrderTrackings');
        $orders = app(OrderResolver::class);
        $order = Order::query()->findOrFail(5);
        $existing = [
            ['id' => 1, 'tracking_number' => 'YT-EXPECTED', 'note' => 'New handover note'],
            ['id' => 2, 'tracking_number' => 'YT-CORRECT', 'taobao_purchase_order_ids' => [1, 2]],
        ];
        DB::transaction(fn () => $sync->invoke($orders, $order, [
            ...$existing,
            ['tracking_number' => 'YT-NO-PURCHASE', 'taobao_purchase_order_ids' => []],
        ]));
        $newTracking = $order->orderTrackings()->where('tracking_number', 'YT-NO-PURCHASE')->firstOrFail();
        $this->assertFalse($newTracking->taobaoPurchaseOrders()->exists());
        $this->assertEquals(4, $package->packageItems()->sum('quantity'));
        $this->assertEquals(4, DB::table('order_tracking_items')->where('order_tracking_id', 1)->sum('quantity'));
        $this->assertEquals(2, DB::table('taobao_purchase_order_trackings')->where('order_tracking_id', 2)->count());
        try {
            DB::transaction(fn () => $sync->invoke($orders, $order, [$existing[1]]));
            $this->fail('Expected deletion of received tracking to be refused.');
        } catch (HttpException $exception) {
            $this->assertStringContainsString('đã được kho tiếp nhận', $exception->getMessage());
        }
        $this->assertDatabaseCount('order_trackings', 3);
    }

    public function test_warehouse_inspector_without_order_permissions_cannot_verify_purchase_links(): void
    {
        DB::table('roles')->insert(['id' => 2, 'permissions' => '["cn_packages.read","cn_packages.inspect"]']);
        DB::table('users')->where('id', 2)->update(['role_id' => 2]);
        $this->actingAs(User::query()->findOrFail(2));
        try {
            app(CnTrackingPurchaseLinkResolver::class)->show(null, ['package_id' => 1]);
            $this->fail('Expected permission check before loading the package.');
        } catch (HttpException $exception) {
            $this->assertSame(403, $exception->getStatusCode());
        }
    }

    public function test_inspection_review_finds_candidates_without_writing_links_and_respects_existing_links(): void
    {
        DB::table('order_items')->insert(['id' => 20, 'order_id' => 5, 'quantity' => 10, 'price_cny' => 8, 'product_name' => 'SKU A']);
        DB::table('taobao_purchase_order_trackings')->where('order_tracking_id', 1)->delete();
        DB::table('taobao_purchase_order_items')->insert(['taobao_purchase_order_id' => 1, 'order_item_id' => 20, 'quantity' => 6]);
        $warehouse = app(CnPackageResolver::class);
        $review = app(CnTrackingPurchaseLinkResolver::class);
        $first = $warehouse->create(null, ['input' => $this->receipt('YT-EXPECTED')]);
        $second = $warehouse->create(null, ['input' => $this->receipt('YT-CORRECT')]);
        $warehouse->confirmItems(null, ['package_id' => $second->id, 'items' => [['order_item_id' => 20, 'quantity' => 4]]]);
        $selection = ['package_id' => $first->id, 'items' => [['order_item_id' => '20', 'quantity' => 5]]];
        $single = $review->inspectionReview(null, $selection);
        $this->assertSame('candidates', $single['status']);
        $this->assertFalse($single['ambiguous']);
        $this->assertSame([1], array_column($single['candidates'], 'id'));
        $this->assertSame(4, $single['quantities'][0]['checked_elsewhere']);
        $this->assertSame(6, $single['quantities'][0]['remaining']);
        $this->assertDatabaseCount('taobao_purchase_order_trackings', 1);
        $this->assertSame('no_items', $review->inspectionReview(null, ['package_id' => $first->id])['status']);
        $warehouse->confirmItems(null, $selection + ['preserve_unselected' => true]);
        $this->assertSame($single, $review->inspectionReview(null, ['package_id' => $first->id]));
        $this->assertDatabaseCount('taobao_purchase_order_trackings', 1);

        DB::table('taobao_purchase_order_items')->insert(['taobao_purchase_order_id' => 2, 'order_item_id' => 20, 'quantity' => 4]);
        $multiple = $review->inspectionReview(null, $selection);
        $this->assertTrue($multiple['ambiguous']);
        $this->assertSame([1, 2], array_column($multiple['candidates'], 'id'));
        DB::table('taobao_purchase_order_trackings')->insert(['taobao_purchase_order_id' => 2, 'order_tracking_id' => 1]);
        $conflict = $review->inspectionReview(null, $selection);
        $this->assertSame('conflict', $conflict['status']);
        $this->assertSame(['2'], $conflict['purchase_ids']);

        DB::table('roles')->insert(['id' => 2, 'permissions' => '["cn_packages.read","cn_packages.inspect"]']);
        DB::table('users')->where('id', 2)->update(['role_id' => 2]);
        $this->actingAs(User::query()->findOrFail(2));
        $restricted = $review->inspectionReview(null, $selection);
        $this->assertSame([], $restricted['purchase_ids']);
        $this->assertSame([], $restricted['linked_purchases']);
        $this->assertSame([], $restricted['candidates']);
        $this->assertDatabaseCount('audit_logs', 0);
        try {
            $review->update(null, ['input' => ['package_id' => $first->id]]);
            $this->fail('An inspector must not be able to write purchase links.');
        } catch (HttpException $exception) {
            $this->assertSame(403, $exception->getStatusCode());
        }
        $this->expectException(CnPackageInputException::class);
        $review->inspectionReview(null, array_replace($selection, ['items' => [['order_item_id' => '99', 'quantity' => 1]]]));
    }

    public function test_partial_inspection_and_add_only_verification_preserve_existing_rows(): void
    {
        DB::table('order_items')->insert([
            ['id' => 20, 'order_id' => 5, 'quantity' => 10, 'price_cny' => 8],
            ['id' => 21, 'order_id' => 5, 'quantity' => 5, 'price_cny' => 6],
            ['id' => 22, 'order_id' => 6, 'quantity' => 5, 'price_cny' => 6],
        ]);
        DB::table('taobao_purchase_order_items')->insert(['taobao_purchase_order_id' => 1, 'order_item_id' => 20, 'quantity' => 8]);
        $warehouse = app(CnPackageResolver::class);
        $package = $warehouse->create(null, ['input' => $this->receipt('YT-CORRECT')]);
        $oldItems = [['order_item_id' => '20', 'quantity' => 4], ['order_item_id' => '21', 'quantity' => 1]];
        $warehouse->confirmItems(null, ['package_id' => $package->id, 'items' => $oldItems]);
        $unchangedItem = DB::table('cn_package_items')->where('order_item_id', 21)->first();
        $unchangedTrackingItem = DB::table('order_tracking_items')->where('order_item_id', 21)->first();
        $warehouse->confirmItems(null, [
            'package_id' => $package->id, 'items' => [['order_item_id' => '20', 'quantity' => 5]],
            'expected_items' => $oldItems, 'preserve_unselected' => true,
        ]);
        $this->assertEquals($unchangedItem, DB::table('cn_package_items')->where('order_item_id', 21)->first());
        $this->assertEquals($unchangedTrackingItem, DB::table('order_tracking_items')->where('order_item_id', 21)->first());
        $this->assertEquals(6, $package->packageItems()->sum('quantity'));
        foreach ([
            [['order_item_id' => '20', 'quantity' => 5], ['expected_items' => $oldItems], 'đã thay đổi'],
            [['order_item_id' => '22', 'quantity' => 1], [], 'không thuộc đơn VietTrung'],
        ] as [$item, $extra, $message]) {
            try {
                $warehouse->confirmItems(null, $extra + [
                    'package_id' => $package->id, 'items' => [$item], 'preserve_unselected' => true,
                ]);
                $this->fail('Expected the inspection update to be refused.');
            } catch (CnPackageInputException $exception) {
                $this->assertStringContainsString($message, $exception->getMessage());
            }
        }

        $review = app(CnTrackingPurchaseLinkResolver::class);
        $input = ['package_id' => $package->id, 'tracking_id' => 2, 'expected_purchase_ids' => [2],
            'purchase_ids' => [1], 'reason' => 'Seller shipping manifest', 'add_only' => true];
        try {
            $review->update(null, ['input' => $input]);
            $this->fail('Expected removal to be refused.');
        } catch (CnPackageInputException $exception) {
            $this->assertStringContainsString('Phải giữ', $exception->getMessage());
        }
        DB::unprepared("CREATE TRIGGER reject_verification_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'fixture audit failure'); END");
        $input['purchase_ids'] = [1, 2];
        try {
            $review->update(null, ['input' => $input]);
            $this->fail('Expected the verification audit to fail.');
        } catch (QueryException) {
            $this->assertEquals(6, $package->packageItems()->sum('quantity'));
            $this->assertDatabaseMissing('taobao_purchase_order_trackings', ['taobao_purchase_order_id' => 1, 'order_tracking_id' => 2]);
        }
        DB::statement('DROP TRIGGER reject_verification_audit');
        $this->assertSame(['1', '2'], $review->update(null, ['input' => $input])['purchase_ids']);
        $this->assertDatabaseHas('taobao_purchase_order_trackings', ['taobao_purchase_order_id' => 1, 'order_tracking_id' => 1]);
        $this->assertSame(['1'], AuditLog::query()->sole()->after_data['added']);
        DB::table('cn_batches')->insert(['id' => 2, 'warehouse_id' => 7]);
        DB::table('cn_batch_packages')->insert(['cn_package_id' => $package->id, 'cn_batch_id' => 2]);
        $this->expectExceptionMessage('Package is already assigned to a batch.');
        $warehouse->confirmItems(null, [
            'package_id' => $package->id, 'items' => [['order_item_id' => 20, 'quantity' => 4]], 'preserve_unselected' => true,
        ]);
    }

    private function receipt(string $trackingNumber): array
    {
        return [
            'warehouse_id' => 7, 'receiver_user_id' => 2, 'tracking_number' => $trackingNumber,
            'weight' => 1.25, 'received_at' => now()->subMinute()->toDateTimeString(),
        ];
    }
}
