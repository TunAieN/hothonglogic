<?php

namespace App\Services\Shipping;

use Illuminate\Support\Facades\Log;

class GhnFeeAudit
{
    public const REQUEST_FIELDS = [
        'service_id',
        'service_type_id',
        'from_district_id',
        'from_ward_code',
        'to_district_id',
        'to_ward_code',
        'weight',
        'length',
        'width',
        'height',
        'insurance_value',
        'cod_value',
        'coupon',
    ];

    public const RESPONSE_FIELDS = [
        'total',
        'service_fee',
        'insurance_fee',
        'pick_station_fee',
        'coupon_value',
        'r2s_fee',
        'return_again',
        'document_return',
        'double_check',
        'cod_fee',
        'pick_remote_areas_fee',
        'deliver_remote_areas_fee',
        'cod_failed_fee',
    ];

    public function log(string $scope, array $request, array $response): void
    {
        if (! config('app.debug')) {
            return;
        }

        $scope = strtoupper($scope);
        Log::debug("[GHN_FEE_{$scope}_REQUEST]", $this->only($request, self::REQUEST_FIELDS));
        Log::debug("[GHN_FEE_{$scope}_RESPONSE]", $this->only($response, self::RESPONSE_FIELDS));
    }

    public function compare(array $paymentPayload, array $shippingPayload): array
    {
        $comparison = [];
        foreach (self::REQUEST_FIELDS as $field) {
            $payment = $paymentPayload[$field] ?? null;
            $shipping = $shippingPayload[$field] ?? null;
            $comparison[$field] = [
                'payment' => $payment,
                'shipping' => $shipping,
                'status' => $payment === $shipping ? 'MATCH' : 'DIFF',
            ];
        }

        return $comparison;
    }

    private function only(array $values, array $fields): array
    {
        $safe = [];
        foreach ($fields as $field) {
            $safe[$field] = $values[$field] ?? null;
        }

        return $safe;
    }
}
