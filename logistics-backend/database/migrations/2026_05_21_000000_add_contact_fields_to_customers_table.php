<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            if (! Schema::hasColumn('customers', 'vip_group')) {
                $table->string('vip_group', 50)->nullable()->after('name');
            }

            if (! Schema::hasColumn('customers', 'province')) {
                $table->string('province', 100)->nullable()->after('email');
            }

            if (! Schema::hasColumn('customers', 'district')) {
                $table->string('district', 100)->nullable()->after('province');
            }

            if (! Schema::hasColumn('customers', 'ward')) {
                $table->string('ward', 100)->nullable()->after('district');
            }
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $columns = array_values(array_filter([
                Schema::hasColumn('customers', 'vip_group') ? 'vip_group' : null,
                Schema::hasColumn('customers', 'province') ? 'province' : null,
                Schema::hasColumn('customers', 'district') ? 'district' : null,
                Schema::hasColumn('customers', 'ward') ? 'ward' : null,
            ]));

            if ($columns !== []) {
                $table->dropColumn($columns);
            }
        });
    }
};
