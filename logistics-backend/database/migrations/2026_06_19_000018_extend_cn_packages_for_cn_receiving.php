<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cn_packages', function (Blueprint $table) {
            if (! Schema::hasColumn('cn_packages', 'actual_length')) {
                $table->decimal('actual_length', 10, 2)->nullable()->after('weight');
            }

            if (! Schema::hasColumn('cn_packages', 'actual_width')) {
                $table->decimal('actual_width', 10, 2)->nullable()->after('actual_length');
            }

            if (! Schema::hasColumn('cn_packages', 'actual_height')) {
                $table->decimal('actual_height', 10, 2)->nullable()->after('actual_width');
            }

            if (! Schema::hasColumn('cn_packages', 'volumetric_weight')) {
                $table->decimal('volumetric_weight', 10, 2)->nullable()->after('volume');
            }

            if (! Schema::hasColumn('cn_packages', 'chargeable_weight')) {
                $table->decimal('chargeable_weight', 10, 2)->nullable()->after('volumetric_weight');
            }

            if (! Schema::hasColumn('cn_packages', 'package_condition')) {
                $table->string('package_condition', 50)->nullable()->after('status');
            }
        });
    }

    public function down(): void
    {
        Schema::table('cn_packages', function (Blueprint $table) {
            foreach ([
                'package_condition',
                'chargeable_weight',
                'volumetric_weight',
                'actual_height',
                'actual_width',
                'actual_length',
            ] as $column) {
                if (Schema::hasColumn('cn_packages', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
