<?php

namespace Tests\Unit;

use App\Services\Shipping\GhnFeeAudit;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class GhnFeeAuditTest extends TestCase
{
    public function test_fixed_payment_and_shipping_payloads_match_in_every_fee_field(): void
    {
        $payment = $this->payload(788040);
        $shipping = $this->payload(788040);

        $comparison = (new GhnFeeAudit)->compare($payment, $shipping);

        foreach (GhnFeeAudit::REQUEST_FIELDS as $field) {
            $this->assertSame('MATCH', $comparison[$field]['status'], $field);
        }
    }

    public function test_debug_log_whitelists_payload_and_response_without_credentials(): void
    {
        config()->set('app.debug', true);
        Log::spy();

        (new GhnFeeAudit)->log('PAYMENT_VOUCHER', [
            ...$this->payload(788040),
            'token' => 'must-not-be-logged',
            'authorization' => 'must-not-be-logged',
        ], [
            'total' => 1014119,
            'service_fee' => 1014119,
            'insurance_fee' => 0,
            'raw_secret' => 'must-not-be-logged',
        ]);

        Log::shouldHaveReceived('debug')->twice()->withArgs(function (string $message, array $context): bool {
            return str_starts_with($message, '[GHN_FEE_PAYMENT_VOUCHER_')
                && ! array_key_exists('token', $context)
                && ! array_key_exists('authorization', $context)
                && ! array_key_exists('raw_secret', $context);
        });
    }

    private function payload(int $insuranceValue): array
    {
        return [
            'service_id' => 53320,
            'service_type_id' => 2,
            'from_district_id' => 1542,
            'from_ward_code' => '1B1517',
            'to_district_id' => 3303,
            'to_ward_code' => '91275',
            'weight' => 12000,
            'length' => 100,
            'width' => 100,
            'height' => 100,
            'insurance_value' => $insuranceValue,
            'cod_value' => 0,
            'coupon' => null,
        ];
    }
}
