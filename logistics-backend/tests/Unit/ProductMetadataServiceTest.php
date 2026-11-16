<?php

namespace Tests\Unit;

use App\Services\Products\ProductMetadataService;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class ProductMetadataServiceTest extends TestCase
{
    public function test_supported_urls_are_normalized_and_unsupported_hosts_are_rejected(): void
    {
        $service = new ProductMetadataService(fn () => ['93.184.216.34']);
        $this->assertSame('https://item.taobao.com/item.htm?id=123', $service->normalizeSupportedUrl(' https://item.taobao.com/item.htm?id=123#detail '));
        $this->assertSame('https://detail.1688.com/offer/123.html', $service->normalizeSupportedUrl('https://detail.1688.com/offer/123.html'));
        $this->expectException(HttpException::class);
        $service->normalizeSupportedUrl('http://127.0.0.1/internal');
    }

    public function test_public_product_metadata_is_parsed_without_inventing_missing_fields(): void
    {
        Http::fake(['item.taobao.com/*' => Http::response(<<<'HTML'
            <html><head>
            <meta property="og:title" content="Áo khoác thử nghiệm">
            <meta property="og:image" content="https://img.example.test/product.jpg">
            <script type="application/ld+json">{"@type":"Product","name":"Tên JSON","offers":{"price":"88.50"},"hasVariant":[{"@type":"Product","name":"Đỏ / L","color":"Đỏ","size":"L","offers":{"price":"90"}}]}</script>
            </head></html>
            HTML, 200, ['Content-Type' => 'text/html'])]);
        $service = new ProductMetadataService(fn () => ['93.184.216.34']);
        $result = $service->fetch('https://item.taobao.com/item.htm?id=123');
        $this->assertSame('success', $result['status']);
        $this->assertSame('Taobao', $result['source']);
        $this->assertSame('Áo khoác thử nghiệm', $result['title']);
        $this->assertSame(88.5, $result['price_cny']);
        $this->assertSame('Đỏ / L', $result['skus'][0]['label']);
    }

    public function test_private_dns_resolution_is_blocked_before_http_request(): void
    {
        Http::fake();
        $service = new ProductMetadataService(fn () => ['127.0.0.1']);
        try {
            $service->fetch('https://item.taobao.com/item.htm?id=123');
            $this->fail('Expected private resolution to be rejected.');
        } catch (HttpException $exception) {
            $this->assertSame(422, $exception->getStatusCode());
        }
        Http::assertNothingSent();
    }

    public function test_login_or_captcha_page_is_not_reported_as_product_success(): void
    {
        $service = new ProductMetadataService(fn () => ['93.184.216.34']);
        $result = $service->parseHtml('<html><head><meta property="og:title" content="Taobao Login 验证码"></head></html>', 'https://item.taobao.com/item.htm?id=123');
        $this->assertSame('partial', $result['status']);
        $this->assertNull($result['title']);
        $this->assertNull($result['price_cny']);
    }

    public function test_timeout_returns_gateway_timeout_without_fabricated_product(): void
    {
        Http::fake(['detail.tmall.com/*' => function () {
            throw new ConnectionException('timeout');
        }]);
        $service = new ProductMetadataService(fn () => ['93.184.216.34']);
        $this->expectException(HttpException::class);
        $this->expectExceptionMessage('Nguồn hàng không phản hồi');
        $service->fetch('https://detail.tmall.com/item.htm?id=123');
    }
}
