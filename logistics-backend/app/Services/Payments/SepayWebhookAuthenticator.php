<?php

namespace App\Services\Payments;

final class SepayWebhookAuthenticator
{
    public function verificationError(
        string $rawBody,
        string $timestamp,
        string $signature,
        string $secret,
        int $nowTimestamp,
        int $toleranceSeconds,
    ): ?string {
        if ($secret === '') {
            return 'secret_missing';
        }
        if (! ctype_digit($timestamp) || abs($nowTimestamp - (int) $timestamp) > max(30, $toleranceSeconds)) {
            return 'timestamp_invalid';
        }
        $expected = 'sha256='.hash_hmac('sha256', $timestamp.'.'.$rawBody, $secret);

        return hash_equals($expected, strtolower(trim($signature))) ? null : 'signature_invalid';
    }
}
