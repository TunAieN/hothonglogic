<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('shipping_rates')) {
            Schema::create('shipping_rates', function (Blueprint $table) {
                $table->id();
                $table->date('valid_from');
                $table->date('valid_to');
                $table->timestamps();
                $table->index(['valid_from', 'valid_to']);
            });
        }

        if (! Schema::hasTable('shipping_rate_details')) {
            Schema::create('shipping_rate_details', function (Blueprint $table) {
                $table->id();
                $table->foreignId('rate_id')->constrained('shipping_rates')->cascadeOnDelete();
                $table->decimal('weight_from', 10, 2);
                $table->decimal('weight_to', 10, 2)->nullable();
                $table->decimal('price_per_kg', 15, 2);
                $table->timestamps();
                $table->index(['weight_from', 'weight_to']);
            });
        }

        Schema::table('vn_packages', function (Blueprint $table) {
            if (! Schema::hasColumn('vn_packages', 'payment_status')) {
                $table->string('payment_status', 30)->default('unpaid')->after('inspection_status');
            }
            if (! Schema::hasColumn('vn_packages', 'payment_voucher_id')) {
                $table->unsignedBigInteger('payment_voucher_id')->nullable()->after('payment_status');
            }
            if (! Schema::hasColumn('vn_packages', 'payment_locked_at')) {
                $table->timestamp('payment_locked_at')->nullable()->after('payment_voucher_id');
            }
            if (! Schema::hasColumn('vn_packages', 'delivery_status')) {
                $table->string('delivery_status', 30)->default('waiting_inspection')->after('payment_locked_at');
            }
        });

        if (! Schema::hasTable('payment_vouchers')) {
            Schema::create('payment_vouchers', function (Blueprint $table) {
                $table->id();
                $table->string('voucher_code', 50)->unique();
                $table->string('request_uuid', 100)->nullable()->unique();
                $table->foreignId('customer_id')->constrained('customers')->restrictOnDelete();
                $table->foreignId('vn_warehouse_id')->nullable()->constrained('vn_warehouses')->nullOnDelete();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->string('receiver_type', 40)->default('pickup_at_warehouse');
                $table->text('delivery_address')->nullable();
                $table->string('payment_method_expected', 40)->default('bank_transfer');
                $table->string('status', 30)->default('waiting_payment');
                $table->decimal('shipping_fee_total', 15, 2)->default(0);
                $table->decimal('domestic_shipping_fee', 15, 2)->default(0);
                $table->decimal('surcharge_total', 15, 2)->default(0);
                $table->decimal('total_amount', 15, 2)->default(0);
                $table->decimal('deposit_applied', 15, 2)->default(0);
                $table->decimal('customer_credit_applied', 15, 2)->default(0);
                $table->decimal('paid_amount', 15, 2)->default(0);
                $table->decimal('remaining_amount', 15, 2)->default(0);
                $table->text('note')->nullable();
                $table->text('cancelled_reason')->nullable();
                $table->foreignId('cancelled_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('cancelled_at')->nullable();
                $table->timestamps();
                $table->index(['customer_id', 'status']);
                $table->index('created_at');
            });
        }

        if (! Schema::hasTable('payment_voucher_packages')) {
            Schema::create('payment_voucher_packages', function (Blueprint $table) {
                $table->id();
                $table->foreignId('payment_voucher_id')->constrained('payment_vouchers')->cascadeOnDelete();
                $table->foreignId('vn_package_id')->constrained('vn_packages')->restrictOnDelete();
                $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
                $table->decimal('actual_weight', 10, 2)->default(0);
                $table->decimal('volumetric_weight', 10, 2)->default(0);
                $table->decimal('chargeable_weight', 10, 2)->default(0);
                $table->decimal('price_per_kg', 15, 2)->default(0);
                $table->decimal('shipping_fee', 15, 2)->default(0);
                $table->decimal('domestic_shipping_fee', 15, 2)->default(0);
                $table->decimal('surcharge_amount', 15, 2)->default(0);
                $table->decimal('total_amount', 15, 2)->default(0);
                $table->timestamps();
                $table->unique(['payment_voucher_id', 'vn_package_id'], 'pv_package_unique');
                $table->index('vn_package_id');
            });
        }

        if (! Schema::hasTable('payment_voucher_surcharges')) {
            Schema::create('payment_voucher_surcharges', function (Blueprint $table) {
                $table->id();
                $table->foreignId('payment_voucher_id')->constrained('payment_vouchers')->cascadeOnDelete();
                $table->foreignId('payment_voucher_package_id')->nullable()->constrained('payment_voucher_packages')->cascadeOnDelete();
                $table->foreignId('vn_package_id')->nullable()->constrained('vn_packages')->nullOnDelete();
                $table->string('surcharge_type', 40)->default('other');
                $table->decimal('amount', 15, 2);
                $table->text('note')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('payment_transactions')) {
            Schema::create('payment_transactions', function (Blueprint $table) {
                $table->id();
                $table->string('transaction_code', 50)->unique();
                $table->foreignId('payment_voucher_id')->constrained('payment_vouchers')->restrictOnDelete();
                $table->decimal('amount', 15, 2);
                $table->string('payment_method', 40);
                $table->string('bank_name', 100)->nullable();
                $table->string('bank_transaction_code', 100)->nullable();
                $table->timestamp('received_at');
                $table->foreignId('confirmed_by')->nullable()->constrained('users')->nullOnDelete();
                $table->string('status', 30)->default('confirmed');
                $table->text('note')->nullable();
                $table->string('proof_image_path')->nullable();
                $table->timestamps();
                $table->index(['payment_voucher_id', 'status']);
            });
        }

        if (! Schema::hasTable('customer_balance_ledgers')) {
            Schema::create('customer_balance_ledgers', function (Blueprint $table) {
                $table->id();
                $table->foreignId('customer_id')->constrained('customers')->restrictOnDelete();
                $table->foreignId('payment_voucher_id')->nullable()->constrained('payment_vouchers')->nullOnDelete();
                $table->foreignId('transaction_id')->nullable()->constrained('payment_transactions')->nullOnDelete();
                $table->string('type', 30);
                $table->decimal('amount', 15, 2);
                $table->decimal('balance_after', 15, 2);
                $table->text('description');
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->index('customer_id');
            });
        }

        if (! Schema::hasTable('audit_logs')) {
            Schema::create('audit_logs', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('action', 80);
                $table->string('entity_type', 80);
                $table->unsignedBigInteger('entity_id')->nullable();
                $table->json('before_data')->nullable();
                $table->json('after_data')->nullable();
                $table->string('ip')->nullable();
                $table->string('user_agent')->nullable();
                $table->timestamp('created_at')->useCurrent();
                $table->index(['entity_type', 'entity_id']);
                $table->index('action');
            });
        }

        if (! Schema::hasTable('invoices')) {
            Schema::create('invoices', function (Blueprint $table) {
                $table->id();
                $table->foreignId('payment_voucher_id')->nullable()->unique()->constrained('payment_vouchers')->nullOnDelete();
                $table->string('invoice_code', 50)->unique();
                $table->foreignId('customer_id')->constrained('customers')->restrictOnDelete();
                $table->foreignId('issued_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('issued_at')->nullable();
                $table->decimal('total_amount', 15, 2)->default(0);
                $table->decimal('paid_amount', 15, 2)->default(0);
                $table->string('status', 30)->default('issued');
                $table->text('note')->nullable();
                $table->timestamps();
            });
        } else {
            Schema::table('invoices', function (Blueprint $table) {
                if (! Schema::hasColumn('invoices', 'payment_voucher_id')) {
                    $table->unsignedBigInteger('payment_voucher_id')->nullable()->unique();
                }
                if (! Schema::hasColumn('invoices', 'issued_by')) {
                    $table->unsignedBigInteger('issued_by')->nullable();
                }
                if (! Schema::hasColumn('invoices', 'issued_at')) {
                    $table->timestamp('issued_at')->nullable();
                }
                if (! Schema::hasColumn('invoices', 'paid_amount')) {
                    $table->decimal('paid_amount', 15, 2)->default(0);
                }
            });
        }

        if (! Schema::hasTable('invoice_items')) {
            Schema::create('invoice_items', function (Blueprint $table) {
                $table->id();
                $table->foreignId('invoice_id')->constrained('invoices')->cascadeOnDelete();
                $table->foreignId('payment_voucher_package_id')->nullable()->constrained('payment_voucher_packages')->nullOnDelete();
                $table->string('item_type', 40);
                $table->text('description');
                $table->decimal('quantity', 12, 2)->default(1);
                $table->decimal('unit_price', 15, 2)->default(0);
                $table->decimal('amount', 15, 2)->default(0);
                $table->json('metadata')->nullable();
                $table->timestamps();
            });
        } else {
            Schema::table('invoice_items', function (Blueprint $table) {
                if (! Schema::hasColumn('invoice_items', 'payment_voucher_package_id')) {
                    $table->unsignedBigInteger('payment_voucher_package_id')->nullable();
                }
                if (! Schema::hasColumn('invoice_items', 'item_type')) {
                    $table->string('item_type', 40)->default('shipping_fee');
                }
                if (! Schema::hasColumn('invoice_items', 'quantity')) {
                    $table->decimal('quantity', 12, 2)->default(1);
                }
                if (! Schema::hasColumn('invoice_items', 'unit_price')) {
                    $table->decimal('unit_price', 15, 2)->default(0);
                }
                if (! Schema::hasColumn('invoice_items', 'amount')) {
                    $table->decimal('amount', 15, 2)->default(0);
                }
                if (! Schema::hasColumn('invoice_items', 'metadata')) {
                    $table->json('metadata')->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        // Intentionally non-destructive: this migration is designed for production data safety.
        // Tables/columns may already exist in older deployments, so rollback must not drop data.
    }
};
