<?php

namespace App\Services\Warehouses\China;

final class CnPackageTrackingInputPolicy
{
    public function evaluate(
        ?string $trackingNumber,
        bool $matchedTrackingExists,
        bool $orderCodeExists,
        bool $duplicateExists,
    ): array {
        if ($trackingNumber === null || $trackingNumber === '') {
            return $this->invalid('Vui lòng nhập mã vận đơn thực tế.', 'CN_PACKAGE_TRACKING_REQUIRED');
        }

        if ($duplicateExists) {
            return $this->invalid('Mã vận đơn đã tồn tại trong kho Trung Quốc.', 'CN_PACKAGE_DUPLICATE_TRACKING');
        }

        if (! $matchedTrackingExists && $orderCodeExists) {
            return $this->invalid(
                'Đây là mã đơn hàng VietTrung, không phải mã vận đơn.',
                'CN_PACKAGE_ORDER_CODE_NOT_TRACKING',
            );
        }

        return [
            'valid' => true,
            'message' => null,
            'code' => null,
            'matched' => $matchedTrackingExists,
        ];
    }

    private function invalid(string $message, string $code): array
    {
        return [
            'valid' => false,
            'message' => $message,
            'code' => $code,
            'matched' => false,
        ];
    }
}
