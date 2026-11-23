<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SepayWebhookEvent extends Model
{
    protected $fillable = [
        'provider_transaction_id', 'payment_intent_id', 'payload_hash', 'transfer_type',
        'bank_code', 'account_number', 'amount_vnd', 'reference', 'status', 'reconciliation_reason',
        'attempt_count', 'last_attempt_at', 'next_retry_at', 'last_error_code', 'last_error_message',
        'processing_history', 'payload_conflict_count', 'occurred_at', 'processed_at', 'payload',
    ];

    protected $casts = [
        'amount_vnd' => 'integer', 'attempt_count' => 'integer', 'payload_conflict_count' => 'integer',
        'last_attempt_at' => 'datetime', 'next_retry_at' => 'datetime', 'occurred_at' => 'datetime',
        'processed_at' => 'datetime', 'processing_history' => 'array', 'payload' => 'array',
    ];

    public function intent()
    {
        return $this->belongsTo(CustomerPaymentIntent::class, 'payment_intent_id');
    }

    public function getProcessingHistoryJsonAttribute(): string
    {
        return json_encode($this->processing_history ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '[]';
    }
}
