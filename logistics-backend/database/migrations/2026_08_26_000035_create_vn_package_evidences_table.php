<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vn_package_evidences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vn_package_id')->constrained('vn_packages')->cascadeOnDelete();
            $table->string('evidence_type', 30)->default('reconciliation');
            $table->string('disk', 30)->default('public');
            $table->string('file_path');
            $table->string('original_name');
            $table->string('mime_type', 100);
            $table->unsignedBigInteger('file_size');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['vn_package_id', 'evidence_type'], 'vn_package_evidence_lookup');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vn_package_evidences');
    }
};
