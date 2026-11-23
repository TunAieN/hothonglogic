<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SepayWebhookEvent extends Model
{
    protected $fillable = [
        'provider_transaction_id', 'payment_intent_id', 'payload_hash', 'transfer_type',
        'account_number', 'amount_vnd', 'reference', 'status', 'reconciliation_reason',
        'occurred_at', 'processed_at', 'payload',
    ];

    protected $casts = [
        'amount_vnd' => 'integer', 'occurred_at' => 'datetime', 'processed_at' => 'datetime', 'payload' => 'array',
    ];

    public function intent()
    {
        return $this->belongsTo(CustomerPaymentIntent::class, 'payment_intent_id');
    }
}
