<?php

namespace App\Domain\Payments\Enums;

enum PaymentTransactionStatus: string
{
    case CONFIRMED = 'confirmed';
    case CANCELLED = 'cancelled';
}
