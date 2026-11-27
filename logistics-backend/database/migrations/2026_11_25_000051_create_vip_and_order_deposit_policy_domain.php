<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vip_tiers', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('name', 50)->unique();
            $table->unsignedSmallInteger('priority')->unique();
            $table->unsignedBigInteger('minimum_spend_vnd')->default(0);
            $table->decimal('base_deposit_percent', 5, 2)->nullable();
            $table->unsignedBigInteger('credit_limit_vnd')->nullable();
            $table->boolean('deposit_policy_enabled')->default(false);
            $table->boolean('is_default')->default(false);
            $table->boolean('is_active')->default(true);
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['is_active', 'minimum_spend_vnd']);
        });

        // These are proposed membership thresholds only. Financial use stays disabled
        // until the owner explicitly enables each tier after approval.
        $now = now();
        DB::table('vip_tiers')->insert([
            ['code' => 'bronze', 'name' => 'Bronze', 'priority' => 10, 'minimum_spend_vnd' => 0, 'base_deposit_percent' => 80, 'deposit_policy_enabled' => false, 'is_default' => true, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'silver', 'name' => 'Silver', 'priority' => 20, 'minimum_spend_vnd' => 10000000, 'base_deposit_percent' => 70, 'deposit_policy_enabled' => false, 'is_default' => false, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'gold', 'name' => 'Gold', 'priority' => 30, 'minimum_spend_vnd' => 50000000, 'base_deposit_percent' => 60, 'deposit_policy_enabled' => false, 'is_default' => false, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'platinum', 'name' => 'Platinum', 'priority' => 40, 'minimum_spend_vnd' => 150000000, 'base_deposit_percent' => 50, 'deposit_policy_enabled' => false, 'is_default' => false, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
        ]);

        Schema::table('customers', function (Blueprint $table) {
            $table->foreignId('vip_tier_id')->nullable()->after('vip_group')->constrained('vip_tiers')->nullOnDelete();
            $table->unsignedBigInteger('vip_qualified_spend_vnd')->default(0)->after('vip_tier_id');
            $table->index(['vip_tier_id', 'vip_qualified_spend_vnd']);
        });

        Schema::create('customer_vip_spend_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->restrictOnDelete();
            $table->string('source_type', 40);
            $table->unsignedBigInteger('source_id');
            $table->string('event_type', 40);
            $table->bigInteger('amount_vnd');
            $table->timestamp('occurred_at');
            $table->json('metadata')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['source_type', 'source_id', 'event_type'], 'vip_spend_source_event_unique');
            $table->index(['customer_id', 'occurred_at']);
        });

        Schema::create('customer_vip_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->restrictOnDelete();
            $table->foreignId('from_vip_tier_id')->nullable()->constrained('vip_tiers')->nullOnDelete();
            $table->foreignId('to_vip_tier_id')->nullable()->constrained('vip_tiers')->nullOnDelete();
            $table->string('change_type', 30);
            $table->unsignedBigInteger('qualified_spend_vnd')->default(0);
            $table->text('reason');
            $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['customer_id', 'created_at']);
        });

        Schema::create('risk_deposit_policies', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('name', 50)->unique();
            $table->unsignedSmallInteger('priority')->unique();
            $table->decimal('minimum_deposit_percent', 5, 2)->nullable();
            $table->boolean('requires_manager_approval')->default(false);
            $table->boolean('is_active')->default(true);
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        DB::table('risk_deposit_policies')->insert([
            ['code' => 'low', 'name' => 'Thấp', 'priority' => 10, 'minimum_deposit_percent' => null, 'requires_manager_approval' => false, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'medium', 'name' => 'Trung bình', 'priority' => 20, 'minimum_deposit_percent' => null, 'requires_manager_approval' => false, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'high', 'name' => 'Cao', 'priority' => 30, 'minimum_deposit_percent' => null, 'requires_manager_approval' => false, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'special', 'name' => 'Đặc biệt', 'priority' => 40, 'minimum_deposit_percent' => null, 'requires_manager_approval' => true, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
        ]);

        Schema::create('order_deposit_policy_snapshots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->unique()->constrained('orders')->restrictOnDelete();
            $table->foreignId('customer_id')->constrained('customers')->restrictOnDelete();
            $table->foreignId('vip_tier_id')->nullable()->constrained('vip_tiers')->nullOnDelete();
            $table->string('vip_code', 30)->nullable();
            $table->string('vip_name', 50)->nullable();
            $table->unsignedBigInteger('qualified_spend_vnd')->default(0);
            $table->decimal('vip_deposit_percent', 5, 2)->nullable();
            $table->foreignId('risk_deposit_policy_id')->nullable()->constrained('risk_deposit_policies')->nullOnDelete();
            $table->string('risk_code', 30);
            $table->string('risk_name', 50);
            $table->text('risk_reason');
            $table->decimal('risk_minimum_percent', 5, 2)->nullable();
            $table->decimal('capital_minimum_percent', 5, 2)->nullable();
            $table->unsignedBigInteger('base_amount_vnd');
            $table->decimal('recommended_percent', 5, 2);
            $table->decimal('final_percent', 5, 2);
            $table->boolean('deposit_waived')->default(false);
            $table->boolean('is_exception')->default(false);
            $table->text('exception_reason')->nullable();
            $table->foreignId('assessed_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('assessed_at');
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('voucher_issued_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        // Intentionally non-destructive: VIP spend and deposit snapshots are financial
        // audit records. Rollback requires a separately reviewed/manual procedure.
    }
};
