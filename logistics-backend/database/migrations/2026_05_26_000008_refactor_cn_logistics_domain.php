<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cn_warehouses', function (Blueprint $table) {
            if (! Schema::hasColumn('cn_warehouses', 'status')) {
                $table->string('status', 20)->default('active')->after('address');
            }
        });

        if (! Schema::hasTable('order_trackings')) {
            Schema::create('order_trackings', function (Blueprint $table) {
                $table->id();
                $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
                $table->string('tracking_number', 100)->unique();
                $table->string('carrier', 100)->nullable();
                $table->decimal('declared_value', 12, 2)->nullable();
                $table->text('note')->nullable();
                $table->string('status', 20)->default('pending');
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('order_tracking_items')) {
            Schema::create('order_tracking_items', function (Blueprint $table) {
                $table->id();
                $table->foreignId('order_tracking_id')->constrained('order_trackings')->cascadeOnDelete();
                $table->foreignId('order_item_id')->constrained('order_items')->restrictOnDelete();
                $table->unsignedInteger('quantity')->default(1);
                $table->timestamps();
                $table->unique(['order_tracking_id', 'order_item_id'], 'order_tracking_item_unique');
            });
        }

        if (! Schema::hasTable('cn_batches')) {
            Schema::create('cn_batches', function (Blueprint $table) {
                $table->id();
                $table->string('batch_code', 100)->unique();
                $table->foreignId('warehouse_id')->constrained('cn_warehouses')->restrictOnDelete();
                $table->string('status', 20)->default('pending');
                $table->decimal('total_weight', 12, 2)->nullable();
                $table->text('note')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('cn_batch_packages')) {
            Schema::create('cn_batch_packages', function (Blueprint $table) {
                $table->id();
                $table->foreignId('cn_batch_id')->constrained('cn_batches')->cascadeOnDelete();
                $table->foreignId('cn_package_id')->constrained('cn_packages')->cascadeOnDelete();
                $table->timestamps();
                $table->unique('cn_package_id');
                $table->unique(['cn_batch_id', 'cn_package_id'], 'cn_batch_package_unique');
            });
        }

        Schema::table('cn_packages', function (Blueprint $table) {
            if (! Schema::hasColumn('cn_packages', 'order_tracking_id')) {
                $table->foreignId('order_tracking_id')->nullable()->after('order_id')->constrained('order_trackings')->nullOnDelete();
            }

            if (! Schema::hasColumn('cn_packages', 'created_by')) {
                $table->foreignId('created_by')->nullable()->after('note')->constrained('users')->nullOnDelete();
            }
        });

        DB::table('cn_warehouses')
            ->whereNull('status')
            ->update(['status' => 'active']);

        $trackingMap = [];

        DB::table('cn_packages')
            ->select([
                'id',
                'order_id',
                'tracking_number',
                'carrier',
                'declared_value',
                'note',
                'status',
                'received_at',
                'created_at',
                'updated_at',
            ])
            ->whereNotNull('order_id')
            ->whereNotNull('tracking_number')
            ->orderBy('id')
            ->chunkById(200, function ($packages) use (&$trackingMap) {
                foreach ($packages as $package) {
                    $trackingNumber = trim((string) $package->tracking_number);

                    if ($trackingNumber === '') {
                        continue;
                    }

                    $existingTracking = DB::table('order_trackings')
                        ->where('tracking_number', $trackingNumber)
                        ->first();

                    if (! $existingTracking) {
                        $trackingId = DB::table('order_trackings')->insertGetId([
                            'order_id' => $package->order_id,
                            'tracking_number' => $trackingNumber,
                            'carrier' => $package->carrier,
                            'declared_value' => $package->declared_value,
                            'note' => $package->note,
                            'status' => $this->mapLegacyTrackingStatus(
                                $package->status,
                                $package->received_at,
                            ),
                            'created_at' => $package->created_at ?? now(),
                            'updated_at' => $package->updated_at ?? now(),
                        ]);
                    } else {
                        $trackingId = $existingTracking->id;

                        DB::table('order_trackings')
                            ->where('id', $trackingId)
                            ->update([
                                'order_id' => $existingTracking->order_id ?? $package->order_id,
                                'carrier' => $existingTracking->carrier ?? $package->carrier,
                                'declared_value' => $existingTracking->declared_value ?? $package->declared_value,
                                'note' => $existingTracking->note ?? $package->note,
                                'status' => $this->preferTrackingStatus(
                                    $existingTracking->status,
                                    $package->status,
                                    $package->received_at,
                                ),
                                'updated_at' => now(),
                            ]);
                    }

                    $trackingMap[(int) $package->id] = $trackingId;

                    DB::table('cn_packages')
                        ->where('id', $package->id)
                        ->update([
                            'order_tracking_id' => $trackingId,
                            'order_id' => $package->order_id,
                            'status' => $trackingId ? 'matched' : 'unmatched',
                        ]);
                }
            });

        if (Schema::hasTable('cn_package_items')) {
            DB::table('cn_package_items')
                ->select(['id', 'cn_package_id', 'order_item_id', 'quantity', 'created_at', 'updated_at'])
                ->orderBy('id')
                ->chunkById(500, function ($packageItems) use (&$trackingMap) {
                    foreach ($packageItems as $item) {
                        $trackingId = $trackingMap[(int) $item->cn_package_id] ?? null;

                        if (! $trackingId) {
                            $package = DB::table('cn_packages')
                                ->select('order_tracking_id')
                                ->where('id', $item->cn_package_id)
                                ->first();

                            $trackingId = $package?->order_tracking_id;
                        }

                        if (! $trackingId) {
                            continue;
                        }

                        $existing = DB::table('order_tracking_items')
                            ->where('order_tracking_id', $trackingId)
                            ->where('order_item_id', $item->order_item_id)
                            ->first();

                        if ($existing) {
                            DB::table('order_tracking_items')
                                ->where('id', $existing->id)
                                ->update([
                                    'quantity' => (int) $existing->quantity + (int) $item->quantity,
                                    'updated_at' => now(),
                                ]);

                            continue;
                        }

                        DB::table('order_tracking_items')->insert([
                            'order_tracking_id' => $trackingId,
                            'order_item_id' => $item->order_item_id,
                            'quantity' => $item->quantity,
                            'created_at' => $item->created_at ?? now(),
                            'updated_at' => $item->updated_at ?? now(),
                        ]);
                    }
                });
        }

        $legacyBatchMap = [];

        DB::table('cn_packages')
            ->select(['batch_id'])
            ->whereNotNull('batch_id')
            ->distinct()
            ->orderBy('batch_id')
            ->get()
            ->each(function ($row) use (&$legacyBatchMap) {
                $packages = DB::table('cn_packages')
                    ->select(['id', 'warehouse_id', 'weight', 'created_at'])
                    ->where('batch_id', $row->batch_id)
                    ->orderBy('id')
                    ->get();

                if ($packages->isEmpty()) {
                    return;
                }

                $warehouseId = $packages->first()->warehouse_id;
                $totalWeight = $packages->sum(fn ($package) => (float) ($package->weight ?? 0));
                $createdAt = $packages->first()->created_at ?? now();

                $batchId = DB::table('cn_batches')->insertGetId([
                    'batch_code' => 'LEGACY' . $row->batch_id,
                    'warehouse_id' => $warehouseId,
                    'status' => 'pending',
                    'total_weight' => $totalWeight,
                    'note' => 'Migrated from legacy cn_packages.batch_id=' . $row->batch_id,
                    'created_at' => $createdAt,
                    'updated_at' => now(),
                ]);

                $legacyBatchMap[(string) $row->batch_id] = $batchId;

                foreach ($packages as $package) {
                    DB::table('cn_batch_packages')->updateOrInsert(
                        ['cn_package_id' => $package->id],
                        [
                            'cn_batch_id' => $batchId,
                            'created_at' => $package->created_at ?? now(),
                            'updated_at' => now(),
                        ],
                    );
                }
            });
    }

    public function down(): void
    {
        Schema::table('cn_packages', function (Blueprint $table) {
            if (Schema::hasColumn('cn_packages', 'order_tracking_id')) {
                $table->dropConstrainedForeignId('order_tracking_id');
            }

            if (Schema::hasColumn('cn_packages', 'created_by')) {
                $table->dropConstrainedForeignId('created_by');
            }
        });

        if (Schema::hasTable('cn_batch_packages')) {
            Schema::dropIfExists('cn_batch_packages');
        }

        if (Schema::hasTable('cn_batches')) {
            Schema::dropIfExists('cn_batches');
        }

        if (Schema::hasTable('order_tracking_items')) {
            Schema::dropIfExists('order_tracking_items');
        }

        if (Schema::hasTable('order_trackings')) {
            Schema::dropIfExists('order_trackings');
        }

        Schema::table('cn_warehouses', function (Blueprint $table) {
            if (Schema::hasColumn('cn_warehouses', 'status')) {
                $table->dropColumn('status');
            }
        });
    }

    private function mapLegacyTrackingStatus(?string $legacyStatus, mixed $receivedAt): string
    {
        if ($receivedAt !== null) {
            return 'received';
        }

        return match (strtolower((string) $legacyStatus)) {
            'matched' => 'matched',
            'unmatched' => 'unmatched',
            default => 'pending',
        };
    }

    private function preferTrackingStatus(?string $currentStatus, ?string $legacyStatus, mixed $receivedAt): string
    {
        $candidate = $this->mapLegacyTrackingStatus($legacyStatus, $receivedAt);
        $priority = [
            'pending' => 0,
            'unmatched' => 1,
            'matched' => 2,
            'received' => 3,
        ];

        $current = strtolower((string) $currentStatus);

        return ($priority[$candidate] ?? 0) >= ($priority[$current] ?? 0)
            ? $candidate
            : ($current !== '' ? $current : $candidate);
    }
};
