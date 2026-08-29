<?php

namespace Tests\Unit;

use App\GraphQL\Resolvers\OrderResolver;
use App\Services\Payments\PaymentVoucherService;
use Tests\TestCase;

class PaymentVoucherServiceResolutionTest extends TestCase
{
    public function test_service_resolves_its_shipping_rate_dependency(): void
    {
        $this->assertInstanceOf(PaymentVoucherService::class, app(PaymentVoucherService::class));
    }

    public function test_order_resolver_imports_the_laravel_auth_facade(): void
    {
        $reflection = new \ReflectionClass(OrderResolver::class);
        $source = file_get_contents($reflection->getFileName());

        $this->assertStringContainsString('use Illuminate\\Support\\Facades\\Auth;', $source);
        $this->assertStringContainsString('Auth::check()', $source);
    }
}
