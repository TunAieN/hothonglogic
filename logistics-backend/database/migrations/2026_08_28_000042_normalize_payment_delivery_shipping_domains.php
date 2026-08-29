<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payment_vouchers', function (Blueprint $table) {
            if (! Schema::hasColumn('payment_vouchers', 'subtotal')) $table->decimal('subtotal', 15, 2)->default(0)->after('status');
            if (! Schema::hasColumn('payment_vouchers', 'discount_amount')) $table->decimal('discount_amount', 15, 2)->default(0)->after('subtotal');
            if (! Schema::hasColumn('payment_vouchers', 'payment_method')) $table->string('payment_method', 40)->nullable()->after('payment_method_expected');
            if (! Schema::hasColumn('payment_vouchers', 'paid_at')) $table->timestamp('paid_at')->nullable()->after('paid_amount');
        });

        if (! Schema::hasTable('payment_voucher_items')) {
            Schema::create('payment_voucher_items', function (Blueprint $table) {
                $table->id();
                $table->foreignId('payment_voucher_id')->constrained('payment_vouchers')->restrictOnDelete();
                $table->string('item_type', 50);
                $table->text('description');
                $table->decimal('quantity', 12, 3)->default(1);
                $table->decimal('unit_price', 15, 2)->default(0);
                $table->decimal('amount', 15, 2)->default(0);
                $table->string('reference_type', 100)->nullable();
                $table->unsignedBigInteger('reference_id')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamps();
                $table->index(['payment_voucher_id', 'item_type']);
                $table->index(['reference_type', 'reference_id']);
            });
        }

        if (! Schema::hasTable('customer_addresses')) {
            Schema::create('customer_addresses', function (Blueprint $table) {
                $table->id();
                $table->foreignId('customer_id')->constrained('customers')->restrictOnDelete();
                $table->string('label', 100)->nullable();
                $table->string('receiver_name', 150);
                $table->string('receiver_phone', 30);
                $table->string('province_code', 30)->nullable();
                $table->string('province_name', 100)->nullable();
                $table->string('district_code', 30)->nullable();
                $table->string('district_name', 100)->nullable();
                $table->string('ward_code', 30)->nullable();
                $table->string('ward_name', 100)->nullable();
                $table->string('address_line', 255)->nullable();
                $table->text('full_address')->nullable();
                $table->boolean('is_default')->default(false);
                $table->timestamps();
                $table->index(['customer_id', 'is_default']);
            });
        }

        if (! Schema::hasTable('delivery_requests')) {
            Schema::create('delivery_requests', function (Blueprint $table) {
                $table->id();
                $table->foreignId('customer_id')->constrained('customers')->restrictOnDelete();
                $table->foreignId('payment_voucher_id')->nullable()->unique()->constrained('payment_vouchers')->restrictOnDelete();
                $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
                $table->foreignId('shipping_task_id')->nullable()->constrained('shipping_tasks')->nullOnDelete();
                $table->string('delivery_method', 30);
                $table->string('preferred_carrier', 50)->nullable();
                $table->text('delivery_note')->nullable();
                $table->string('status', 30)->default('draft');
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->softDeletes();
                $table->index(['customer_id', 'status']);
                $table->index(['shipping_task_id', 'status']);
            });
        }

        if (! Schema::hasTable('delivery_addresses')) {
            Schema::create('delivery_addresses', function (Blueprint $table) {
                $table->id();
                $table->foreignId('delivery_request_id')->unique()->constrained('delivery_requests')->restrictOnDelete();
                $table->foreignId('source_customer_address_id')->nullable()->constrained('customer_addresses')->nullOnDelete();
                $table->string('receiver_name', 150);
                $table->string('receiver_phone', 30);
                $table->string('province_code', 30)->nullable();
                $table->string('province_name', 100)->nullable();
                $table->string('district_code', 30)->nullable();
                $table->string('district_name', 100)->nullable();
                $table->string('ward_code', 30)->nullable();
                $table->string('ward_name', 100)->nullable();
                $table->string('address_line', 255)->nullable();
                $table->text('full_address')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('shipments')) {
            Schema::create('shipments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('delivery_request_id')->constrained('delivery_requests')->restrictOnDelete();
                $table->string('carrier_code', 50);
                $table->string('service_code', 50)->nullable();
                $table->string('carrier_order_id', 150)->nullable();
                $table->string('tracking_number', 150)->nullable();
                $table->decimal('shipping_fee', 15, 2)->default(0);
                $table->decimal('cod_amount', 15, 2)->default(0);
                $table->decimal('weight', 12, 3)->nullable();
                $table->decimal('length', 12, 2)->nullable();
                $table->decimal('width', 12, 2)->nullable();
                $table->decimal('height', 12, 2)->nullable();
                $table->string('status', 30)->default('pending');
                $table->text('label_url')->nullable();
                $table->json('raw_response')->nullable();
                $table->timestamps();
                $table->softDeletes();
                $table->index('delivery_request_id');
                $table->index('tracking_number');
                $table->index(['carrier_code', 'status']);
            });
        }

        if (! Schema::hasTable('shipment_tracking_events')) {
            Schema::create('shipment_tracking_events', function (Blueprint $table) {
                $table->id();
                $table->foreignId('shipment_id')->constrained('shipments')->restrictOnDelete();
                $table->string('carrier_status', 100)->nullable();
                $table->string('internal_status', 50)->nullable();
                $table->text('description')->nullable();
                $table->string('location', 255)->nullable();
                $table->timestamp('occurred_at')->nullable();
                $table->json('raw_payload')->nullable();
                $table->timestamps();
                $table->index(['shipment_id', 'occurred_at']);
            });
        }

        $this->backfillCustomerAddresses();
        $this->backfillVouchers();
    }

    private function backfillCustomerAddresses(): void
    {
        DB::table('customers')->orderBy('id')->chunkById(100, function ($customers) {
            foreach ($customers as $customer) {
                if (DB::table('customer_addresses')->where('customer_id', $customer->id)->exists()) continue;
                $fullAddress = trim((string) ($customer->address ?? ''));
                if ($fullAddress === '') continue;
                DB::table('customer_addresses')->insert([
                    'customer_id' => $customer->id,
                    'label' => 'Địa chỉ mặc định (dữ liệu cũ)',
                    'receiver_name' => (string) ($customer->name ?? ''),
                    'receiver_phone' => (string) ($customer->phone ?? ''),
                    'province_name' => $customer->province ?? null,
                    'district_name' => $customer->district ?? null,
                    'ward_name' => $customer->ward ?? null,
                    'address_line' => $customer->address ?? null,
                    'full_address' => $fullAddress,
                    'is_default' => true,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        });
    }

    private function backfillVouchers(): void
    {
        DB::table('payment_vouchers')->orderBy('id')->chunkById(100, function ($vouchers) {
            foreach ($vouchers as $voucher) DB::transaction(function () use ($voucher) {
                $isDeposit = ($voucher->voucher_type ?? null) === 'deposit' || ($voucher->receiver_type ?? null) === 'deposit';
                $subtotal = (float) ($voucher->base_amount_vnd ?? 0) + (float) ($voucher->shipping_fee_total ?? 0) + (float) ($voucher->domestic_shipping_fee ?? 0) + (float) ($voucher->surcharge_total ?? 0);
                $discount = (float) ($voucher->deposit_applied ?? 0) + (float) ($voucher->customer_credit_applied ?? 0);
                $paidAt = ($voucher->status ?? null) === 'paid'
                    ? DB::table('payment_transactions')->where('payment_voucher_id', $voucher->id)->where('status', 'confirmed')->max('received_at')
                    : null;
                DB::table('payment_vouchers')->where('id', $voucher->id)->update([
                    'voucher_type' => $isDeposit ? 'deposit' : ($voucher->voucher_type ?? 'shipping'),
                    'subtotal' => $isDeposit ? (float) ($voucher->total_amount ?? 0) : $subtotal,
                    'discount_amount' => $isDeposit ? 0 : $discount,
                    'payment_method' => $voucher->payment_method_expected ?? null,
                    'paid_at' => $paidAt,
                    'updated_at' => $voucher->updated_at ?? now(),
                ]);

                if (! DB::table('payment_voucher_items')->where('payment_voucher_id', $voucher->id)->exists()) {
                    $this->backfillVoucherItems($voucher, $isDeposit);
                }
                if (! $isDeposit) $this->backfillDelivery($voucher);
            });
        });
    }

    private function backfillVoucherItems(object $voucher, bool $isDeposit): void
    {
        $rows = [];
        $add = function (string $type, string $description, float $quantity, float $unitPrice, float $amount, ?string $referenceType = null, ?int $referenceId = null, array $metadata = []) use (&$rows, $voucher) {
            if ($amount == 0.0) return;
            $rows[] = ['payment_voucher_id' => $voucher->id, 'item_type' => $type, 'description' => $description, 'quantity' => $quantity, 'unit_price' => $unitPrice, 'amount' => $amount, 'reference_type' => $referenceType, 'reference_id' => $referenceId, 'metadata' => $metadata ? json_encode($metadata, JSON_UNESCAPED_UNICODE) : null, 'created_at' => now(), 'updated_at' => now()];
        };
        if ($isDeposit) {
            $add('deposit', 'Tiền đặt cọc đơn hàng', 1, (float) $voucher->total_amount, (float) $voucher->total_amount, 'PaymentVoucher', (int) $voucher->id, ['backfilled' => true]);
        } else {
            $add('order_amount', 'Giá trị hàng hóa', 1, (float) ($voucher->base_amount_vnd ?? 0), (float) ($voucher->base_amount_vnd ?? 0), 'PaymentVoucher', (int) $voucher->id, ['backfilled' => true]);
            $packages = DB::table('payment_voucher_packages')->where('payment_voucher_id', $voucher->id)->get();
            foreach ($packages as $package) $add('weight_fee', 'Cước Trung Quốc → Việt Nam', max(1, (float) $package->chargeable_weight), (float) $package->price_per_kg, (float) $package->shipping_fee, 'PaymentVoucherPackage', (int) $package->id, ['vn_package_id' => $package->vn_package_id, 'backfilled' => true]);
            $add('domestic_shipping', 'Phí giao hàng nội địa Việt Nam', 1, (float) ($voucher->domestic_shipping_fee ?? 0), (float) ($voucher->domestic_shipping_fee ?? 0), 'PaymentVoucher', (int) $voucher->id, ['backfilled' => true]);
            $surcharges = DB::table('payment_voucher_surcharges')->where('payment_voucher_id', $voucher->id)->get();
            foreach ($surcharges as $surcharge) $add('surcharge', $surcharge->note ?: ('Phụ phí '.$surcharge->surcharge_type), 1, (float) $surcharge->amount, (float) $surcharge->amount, 'PaymentVoucherSurcharge', (int) $surcharge->id, ['surcharge_type' => $surcharge->surcharge_type, 'backfilled' => true]);
            $mappedSurcharge = (float) $surcharges->sum('amount');
            $difference = (float) ($voucher->surcharge_total ?? 0) - $mappedSurcharge;
            $add('surcharge', 'Phụ phí cũ chưa có chi tiết', 1, $difference, $difference, 'PaymentVoucher', (int) $voucher->id, ['unmapped_legacy_detail' => true, 'backfilled' => true]);
        }
        if ($rows) DB::table('payment_voucher_items')->insert($rows);
    }

    private function backfillDelivery(object $voucher): void
    {
        $method = ($voucher->receiver_type ?? null) === 'local_delivery' ? 'delivery' : 'pickup_at_warehouse';
        $status = match ($voucher->status ?? null) { 'paid' => 'ready_to_ship', 'cancelled' => 'cancelled', default => 'awaiting_payment' };
        $requestId = DB::table('delivery_requests')->where('payment_voucher_id', $voucher->id)->value('id');
        if (! $requestId) {
            $requestId = DB::table('delivery_requests')->insertGetId([
                'customer_id' => $voucher->customer_id, 'payment_voucher_id' => $voucher->id,
                'order_id' => $voucher->order_id ?? null, 'delivery_method' => $method,
                'preferred_carrier' => $voucher->shipping_carrier ?? null,
                'delivery_note' => $voucher->delivery_note ?? null, 'status' => $status,
                'created_by' => $voucher->created_by ?? null, 'created_at' => $voucher->created_at ?? now(), 'updated_at' => now(),
            ]);
        }
        if ($method !== 'delivery' || DB::table('delivery_addresses')->where('delivery_request_id', $requestId)->exists()) return;
        $fullAddress = trim((string) ($voucher->delivery_address ?? ''));
        $defaultAddress = DB::table('customer_addresses')->where('customer_id', $voucher->customer_id)->where('is_default', true)->first();
        DB::table('delivery_addresses')->insert([
            'delivery_request_id' => $requestId, 'source_customer_address_id' => $defaultAddress?->id,
            'receiver_name' => (string) ($voucher->receiver_name ?? ''), 'receiver_phone' => (string) ($voucher->receiver_phone ?? ''),
            'province_name' => $voucher->delivery_province ?? null, 'district_name' => $voucher->delivery_district ?? null,
            'ward_name' => $voucher->delivery_ward ?? null, 'address_line' => $voucher->delivery_address_line ?? null,
            'full_address' => $fullAddress !== '' ? $fullAddress : null,
            'created_at' => $voucher->created_at ?? now(), 'updated_at' => now(),
        ]);
        $carrier = trim((string) ($voucher->shipping_carrier ?? ''));
        if ($carrier !== '' && ! DB::table('shipments')->where('delivery_request_id', $requestId)->exists()) {
            DB::table('shipments')->insert([
                'delivery_request_id' => $requestId, 'carrier_code' => strtoupper($carrier),
                'shipping_fee' => (float) ($voucher->domestic_shipping_fee ?? 0), 'cod_amount' => 0,
                'status' => 'pending', 'raw_response' => json_encode(['backfilled_from_payment_voucher' => true]),
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        // Non-destructive by design. A later cleanup migration may remove legacy columns after verification.
    }
};
