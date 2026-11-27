<?php

namespace Tests\Unit;

use App\Services\Payments\SepayWebhookAuthenticator;
use PHPUnit\Framework\TestCase;

class SepayWebhookAuthenticatorTest extends TestCase
{
    public function test_valid_signature_uses_timestamp_dot_exact_raw_body(): void
    {
        $raw = '{"id":1,"content":"VTABC"}';
        $timestamp = '1800000000';
        $signature = 'sha256='.hash_hmac('sha256', $timestamp.'.'.$raw, 'secret');

        $this->assertNull((new SepayWebhookAuthenticator)->verificationError(
            $raw, $timestamp, $signature, 'secret', 1800000010, 300,
        ));
    }

    public function test_changed_raw_body_invalid_signature_and_expired_timestamp_are_rejected(): void
    {
        $timestamp = '1800000000';
        $signature = 'sha256='.hash_hmac('sha256', $timestamp.'.'.'{"id":1}', 'secret');
        $auth = new SepayWebhookAuthenticator;

        $this->assertSame('signature_invalid', $auth->verificationError(
            '{"id":1 }', $timestamp, $signature, 'secret', 1800000010, 300,
        ));
        $this->assertSame('timestamp_invalid', $auth->verificationError(
            '{"id":1}', $timestamp, $signature, 'secret', 1800000400, 300,
        ));
    }

    public function test_missing_secret_signature_and_timestamp_fail_closed(): void
    {
        $auth = new SepayWebhookAuthenticator;

        $this->assertSame('secret_missing', $auth->verificationError(
            '{}', '1800000000', '', '', 1800000000, 300,
        ));
        $this->assertSame('signature_invalid', $auth->verificationError(
            '{}', '1800000000', '', 'secret', 1800000000, 300,
        ));
        $this->assertSame('timestamp_invalid', $auth->verificationError(
            '{}', '', '', 'secret', 1800000000, 300,
        ));
    }
}
