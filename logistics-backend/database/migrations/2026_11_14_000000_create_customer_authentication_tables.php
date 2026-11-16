<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->unique()->constrained('customers')->restrictOnDelete();
            $table->string('email', 191)->unique();
            $table->string('phone_e164', 20)->nullable()->unique();
            $table->string('password');
            $table->timestamp('email_verified_at')->nullable();
            $table->timestamp('phone_verified_at')->nullable();
            $table->string('status', 20)->default('pending')->index();
            $table->timestamp('last_login_at')->nullable();
            $table->rememberToken();
            $table->timestamps();
        });

        Schema::create('customer_email_verification_tokens', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_account_id')->constrained('customer_accounts')->cascadeOnDelete();
            $table->string('token_hash', 64)->unique();
            $table->timestamp('expires_at');
            $table->timestamp('used_at')->nullable();
            $table->timestamps();
            $table->index(['customer_account_id', 'expires_at'], 'cust_email_verify_account_exp_idx');
        });

        Schema::create('customer_password_reset_tokens', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_account_id')->constrained('customer_accounts')->cascadeOnDelete();
            $table->string('token_hash', 64)->unique();
            $table->timestamp('expires_at');
            $table->timestamp('used_at')->nullable();
            $table->timestamps();
            $table->index(['customer_account_id', 'expires_at'], 'cust_password_reset_account_exp_idx');
        });

        Schema::create('customer_account_audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_account_id')->nullable()->constrained('customer_accounts')->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->string('event', 80)->index();
            $table->json('metadata')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_account_audit_logs');
        Schema::dropIfExists('customer_password_reset_tokens');
        Schema::dropIfExists('customer_email_verification_tokens');
        Schema::dropIfExists('customer_accounts');
    }
};
