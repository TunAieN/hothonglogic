<?php

namespace Tests\Unit;

use App\Services\Payments\PaymentVoucherService;
use Tests\TestCase;

class PaymentVoucherServiceResolutionTest extends TestCase
{
    public function test_service_resolves_its_shipping_rate_dependency(): void
    {
        $this->assertInstanceOf(PaymentVoucherService::class, app(PaymentVoucherService::class));
    }
}
