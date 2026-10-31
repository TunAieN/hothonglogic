<?php

namespace App\Domain\Payments\Enums;

enum PaymentVoucherStatus: string
{
    case DRAFT = 'draft';
    case WAITING_PAYMENT = 'waiting_payment';
    case PARTIAL_PAID = 'partial_paid';
    case PAID = 'paid';
    case CANCELLED = 'cancelled';

    /** @return list<string> */
    public static function activeValues(): array
    {
        return [self::DRAFT->value, self::WAITING_PAYMENT->value, self::PARTIAL_PAID->value];
    }
}
