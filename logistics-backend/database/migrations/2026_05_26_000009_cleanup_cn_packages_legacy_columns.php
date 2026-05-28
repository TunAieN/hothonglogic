<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('cn_packages', 'batch_id')) {
            $databaseName = DB::getDatabaseName();
            $batchForeignKey = DB::table('information_schema.KEY_COLUMN_USAGE')
                ->where('TABLE_SCHEMA', $databaseName)
                ->where('TABLE_NAME', 'cn_packages')
                ->where('COLUMN_NAME', 'batch_id')
                ->whereNotNull('REFERENCED_TABLE_NAME')
                ->value('CONSTRAINT_NAME');

            if ($batchForeignKey) {
                DB::statement(sprintf(
                    'ALTER TABLE cn_packages DROP FOREIGN KEY `%s`',
                    $batchForeignKey,
                ));
            }
        }

        if (Schema::hasColumn('cn_packages', 'batch_id')) {
            DB::table('cn_packages')
                ->select(['id', 'batch_id', 'created_at'])
                ->whereNotNull('batch_id')
                ->orderBy('id')
                ->get()
                ->each(function ($package) {
                    $batch = DB::table('cn_batches')
                        ->where('note', 'like', '%legacy cn_packages.batch_id=' . $package->batch_id . '%')
                        ->first();

                    if (! $batch) {
                        return;
                    }

                    DB::table('cn_batch_packages')->updateOrInsert(
                        ['cn_package_id' => $package->id],
                        [
                            'cn_batch_id' => $batch->id,
                            'created_at' => $package->created_at ?? now(),
                            'updated_at' => now(),
                        ],
                    );
                });
        }

        Schema::table('cn_packages', function (Blueprint $table) {
            $dropColumns = [];

            foreach (['seller', 'shop_id', 'shop_name', 'batch_id'] as $column) {
                if (Schema::hasColumn('cn_packages', $column)) {
                    $dropColumns[] = $column;
                }
            }

            if ($dropColumns !== []) {
                $table->dropColumn($dropColumns);
            }
        });
    }

    public function down(): void
    {
        Schema::table('cn_packages', function (Blueprint $table) {
            if (! Schema::hasColumn('cn_packages', 'seller')) {
                $table->string('seller', 255)->nullable()->after('receiver_name');
            }

            if (! Schema::hasColumn('cn_packages', 'shop_id')) {
                $table->string('shop_id', 100)->nullable()->after('seller');
            }

            if (! Schema::hasColumn('cn_packages', 'shop_name')) {
                $table->string('shop_name', 255)->nullable()->after('shop_id');
            }

            if (! Schema::hasColumn('cn_packages', 'batch_id')) {
                $table->unsignedBigInteger('batch_id')->nullable()->after('status');
            }
        });
    }
};
