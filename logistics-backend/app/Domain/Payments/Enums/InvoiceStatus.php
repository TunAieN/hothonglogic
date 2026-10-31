<?php

namespace App\Domain\Payments\Enums;

enum InvoiceStatus: string
{
    case PENDING = 'pending';
    case CONFIRMED = 'confirmed';
    case CANCELLED = 'cancelled';
    case ISSUED = 'issued';
    case VOIDED = 'voided';
}
