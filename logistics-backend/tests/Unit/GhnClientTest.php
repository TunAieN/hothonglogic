<?php

namespace Tests\Unit;

use App\Services\Shipping\GhnClient;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class GhnClientTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.ghn.base_url' => 'https://ghn.example.test/api',
            'services.ghn.token' => 'backend-secret',
            'services.ghn.shop_id' => '12345',
        ]);
    }

    public function test_master_data_request_uses_backend_credentials(): void
    {
        Http::fake([
            'ghn.example.test/*' => Http::response([
                'code' => 200,
                'data' => [['ProvinceID' => 201, 'ProvinceName' => 'Hà Nội']],
            ]),
        ]);

        $data = (new GhnClient)->provinces();

        $this->assertSame(201, $data[0]['ProvinceID']);
        Http::assertSent(fn ($request) => $request->hasHeader('Token', 'backend-secret')
            && $request->hasHeader('ShopId', '12345'));
    }

    public function test_connection_timeout_becomes_a_retryable_gateway_error(): void
    {
        Http::fake(fn () => throw new ConnectionException('timed out'));

        try {
            (new GhnClient)->provinces();
            $this->fail('Expected an HttpException.');
        } catch (HttpException $exception) {
            $this->assertSame(504, $exception->getStatusCode());
            $this->assertSame('Không thể kết nối GHN. Vui lòng thử lại.', $exception->getMessage());
        }
    }

    public function test_non_200_ghn_code_is_not_swallowed(): void
    {
        Http::fake([
            'ghn.example.test/*' => Http::response(['code' => 400, 'message' => 'Ward không hợp lệ']),
        ]);

        $this->expectException(HttpException::class);
        $this->expectExceptionMessage('GHN: Ward không hợp lệ');

        (new GhnClient)->provinces();
    }

    public function test_preview_mode_prohibits_order_creation_without_an_http_request(): void
    {
        config(['services.ghn.mode' => 'preview']);
        Http::fake();

        try {
            (new GhnClient)->createOrder(['to_name' => 'Không được gửi']);
            $this->fail('Expected preview mode to prohibit GHN order creation.');
        } catch (HttpException $exception) {
            $this->assertSame(403, $exception->getStatusCode());
            $this->assertSame('GHN production order creation is disabled in preview mode.', $exception->getMessage());
        }

        Http::assertNothingSent();
    }
}
