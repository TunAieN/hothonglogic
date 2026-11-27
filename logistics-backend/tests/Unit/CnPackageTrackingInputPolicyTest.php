<?php

namespace Tests\Unit;

use App\Exceptions\CnPackageInputException;
use App\Services\Warehouses\China\CnPackageTrackingInputPolicy;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class CnPackageTrackingInputPolicyTest extends TestCase
{
    public static function cases(): array
    {
        return [
            'missing tracking' => [null, false, false, false, false, 'CN_PACKAGE_TRACKING_REQUIRED'],
            'order code is not tracking' => ['REQ-6854E6C503560102433A', false, true, false, false, 'CN_PACKAGE_ORDER_CODE_NOT_TRACKING'],
            'duplicate tracking' => ['YT123456789CN', true, false, true, false, 'CN_PACKAGE_DUPLICATE_TRACKING'],
            'stored tracking matches order' => ['YT123456789CN', true, false, false, true, null],
            'employee supplied unmatched tracking' => ['SF1234567890', false, false, false, true, null],
        ];
    }

    #[DataProvider('cases')]
    public function test_tracking_policy(
        ?string $trackingNumber,
        bool $matched,
        bool $orderCode,
        bool $duplicate,
        bool $expectedValid,
        ?string $expectedCode,
    ): void {
        $result = (new CnPackageTrackingInputPolicy)->evaluate(
            $trackingNumber,
            $matched,
            $orderCode,
            $duplicate,
        );

        self::assertSame($expectedValid, $result['valid']);
        self::assertSame($expectedCode, $result['code']);
        self::assertSame($expectedValid && $matched, $result['matched']);
    }

    public function test_input_exception_is_safe_and_field_aware(): void
    {
        $exception = new CnPackageInputException(
            'Vui lòng nhập mã vận đơn thực tế, không sử dụng mã đơn hàng.',
            'tracking_number',
            'CN_PACKAGE_ORDER_CODE_NOT_TRACKING',
        );

        self::assertTrue($exception->isClientSafe());
        self::assertSame('tracking_number', $exception->getExtensions()['field']);
        self::assertSame('CN_PACKAGE_ORDER_CODE_NOT_TRACKING', $exception->getExtensions()['code']);
        self::assertStringNotContainsString('SQL', $exception->getMessage());
    }
}
