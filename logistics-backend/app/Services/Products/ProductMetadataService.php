<?php

namespace App\Services\Products;

use Closure;
use DOMDocument;
use DOMXPath;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class ProductMetadataService
{
    private const MAX_BYTES = 1048576;

    private const ALLOWED_ROOTS = ['taobao.com' => 'Taobao', 'tmall.com' => 'Tmall', '1688.com' => '1688'];

    public function __construct(private readonly ?Closure $hostResolver = null) {}

    public function fetch(string $input): array
    {
        $url = $this->normalizeSupportedUrl($input);
        $current = $url;

        for ($redirects = 0; $redirects <= 2; $redirects++) {
            $host = (string) parse_url($current, PHP_URL_HOST);
            $this->assertPublicResolution($host);
            try {
                $response = Http::withHeaders([
                    'Accept' => 'text/html,application/xhtml+xml',
                    'User-Agent' => 'VietTrungOrder-ProductPreview/1.0',
                ])->connectTimeout(3)->timeout(7)->withOptions(['allow_redirects' => false, 'stream' => true])->get($current);
            } catch (ConnectionException) {
                throw new HttpException(504, 'Nguồn hàng không phản hồi trong thời gian cho phép.');
            }

            if ($response->redirect()) {
                $location = $response->header('Location');
                if (! $location || $redirects === 2) {
                    throw new HttpException(502, 'Nguồn hàng chuyển hướng quá nhiều lần.');
                }
                $current = $this->normalizeSupportedUrl($this->absoluteRedirect($current, $location));

                continue;
            }
            if (! $response->successful()) {
                throw new HttpException($response->status() === 404 ? 404 : 502, 'Không thể đọc trang sản phẩm từ nguồn hàng.');
            }
            $contentType = strtolower((string) $response->header('Content-Type'));
            if ($contentType !== '' && ! str_contains($contentType, 'html')) {
                throw new HttpException(422, 'Đường dẫn không trả về trang sản phẩm HTML.');
            }
            $body = $response->toPsrResponse()->getBody()->read(self::MAX_BYTES + 1);
            if (strlen($body) > self::MAX_BYTES) {
                throw new HttpException(413, 'Trang sản phẩm vượt quá giới hạn đọc an toàn.');
            }

            return $this->parseHtml($body, $current);
        }

        throw new HttpException(502, 'Không thể hoàn tất truy xuất sản phẩm.');
    }

    public function normalizeSupportedUrl(string $input): string
    {
        $input = trim($input);
        if ($input === '' || ! filter_var($input, FILTER_VALIDATE_URL)) {
            throw new HttpException(422, 'Link sản phẩm không hợp lệ.');
        }
        $parts = parse_url($input);
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = strtolower(rtrim((string) ($parts['host'] ?? ''), '.'));
        $port = $parts['port'] ?? null;
        if (! in_array($scheme, ['http', 'https'], true) || isset($parts['user']) || isset($parts['pass'])) {
            throw new HttpException(422, 'Chỉ hỗ trợ link HTTP/HTTPS công khai.');
        }
        if ($port !== null && ! in_array((int) $port, [80, 443], true)) {
            throw new HttpException(422, 'Cổng URL không được hỗ trợ.');
        }
        if ($this->sourceForHost($host) === null) {
            throw new HttpException(422, 'Chỉ hỗ trợ link Taobao, Tmall và 1688.');
        }
        $path = $parts['path'] ?? '/';
        $query = isset($parts['query']) && $parts['query'] !== '' ? '?'.$parts['query'] : '';

        return $scheme.'://'.$host.$path.$query;
    }

    public function parseHtml(string $html, string $url): array
    {
        libxml_use_internal_errors(true);
        $document = new DOMDocument;
        $document->loadHTML('<?xml encoding="utf-8" ?>'.$html, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
        $xpath = new DOMXPath($document);
        $meta = fn (string $property) => trim((string) $xpath->evaluate("string(//meta[@property='{$property}' or @name='{$property}']/@content)"));
        $title = $meta('og:title') ?: trim((string) $xpath->evaluate('string(//title)'));
        $image = $meta('og:image') ?: null;
        $price = $meta('product:price:amount') ?: $meta('og:price:amount') ?: null;
        $images = $image ? [$image] : [];
        $skus = [];

        foreach ($xpath->query('//script[@type="application/ld+json"]') ?: [] as $node) {
            $decoded = json_decode(trim($node->textContent), true);
            foreach ($this->jsonLdProducts($decoded) as $product) {
                $title = $title ?: trim((string) ($product['name'] ?? ''));
                $productImages = is_array($product['image'] ?? null) ? $product['image'] : [($product['image'] ?? null)];
                foreach ($productImages as $candidate) {
                    if (is_string($candidate) && filter_var($candidate, FILTER_VALIDATE_URL)) {
                        $images[] = $candidate;
                    }
                }
                $offers = $product['offers'] ?? null;
                $firstOffer = is_array($offers) && array_is_list($offers) ? ($offers[0] ?? null) : $offers;
                if ($price === null && is_array($firstOffer)) {
                    $price = $firstOffer['price'] ?? $firstOffer['lowPrice'] ?? null;
                }
                foreach (($product['hasVariant'] ?? []) as $variant) {
                    if (! is_array($variant)) {
                        continue;
                    }
                    $offer = $variant['offers'] ?? [];
                    $skus[] = ['label' => trim((string) ($variant['name'] ?? 'Phân loại')), 'color' => $variant['color'] ?? null, 'size' => $variant['size'] ?? null, 'price_cny' => is_array($offer) ? ($offer['price'] ?? null) : null, 'image' => is_string($variant['image'] ?? null) ? $variant['image'] : null];
                }
            }
        }

        $images = array_values(array_unique(array_filter($images)));
        $numericPrice = is_numeric($price) ? round((float) $price, 2) : null;
        if (preg_match('/login|sign[ -]?in|đăng nhập|登录|验证码|captcha/i', $title)) {
            $title = '';
            $images = [];
            $numericPrice = null;
            $skus = [];
        }
        $hasUsefulData = $title !== '' || $images !== [] || $numericPrice !== null;

        return [
            'status' => $hasUsefulData ? 'success' : 'partial',
            'message' => $hasUsefulData ? 'Đã lấy thông tin công khai từ trang sản phẩm.' : 'Nguồn hàng không cung cấp metadata công khai. Bạn có thể nhập thủ công.',
            'source' => $this->sourceForHost((string) parse_url($url, PHP_URL_HOST)),
            'normalized_url' => $url, 'title' => $title ?: null, 'image' => $images[0] ?? null,
            'images' => $images, 'price_cny' => $numericPrice, 'skus' => array_values($skus),
        ];
    }

    private function sourceForHost(string $host): ?string
    {
        $host = strtolower($host);
        foreach (self::ALLOWED_ROOTS as $root => $source) {
            if ($host === $root || str_ends_with($host, '.'.$root)) {
                return $source;
            }
        }

        return null;
    }

    private function assertPublicResolution(string $host): void
    {
        $records = $this->hostResolver ? ($this->hostResolver)($host) : dns_get_record($host, DNS_A | DNS_AAAA);
        if ($records === false || $records === []) {
            throw new HttpException(502, 'Không phân giải được địa chỉ nguồn hàng.');
        }
        foreach ($records as $record) {
            $ip = is_string($record) ? $record : ($record['ip'] ?? $record['ipv6'] ?? null);
            if (! $ip || filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
                throw new HttpException(422, 'Địa chỉ nguồn hàng không thuộc mạng công khai an toàn.');
            }
        }
    }

    private function absoluteRedirect(string $base, string $location): string
    {
        if (filter_var($location, FILTER_VALIDATE_URL)) {
            return $location;
        }
        $parts = parse_url($base);
        $origin = $parts['scheme'].'://'.$parts['host'].(isset($parts['port']) ? ':'.$parts['port'] : '');

        return $origin.'/'.ltrim($location, '/');
    }

    private function jsonLdProducts(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }
        $nodes = array_is_list($value) ? $value : [$value];
        $products = [];
        foreach ($nodes as $node) {
            if (! is_array($node)) {
                continue;
            }
            if (($node['@type'] ?? null) === 'Product') {
                $products[] = $node;
            }
            foreach (($node['@graph'] ?? []) as $child) {
                if (is_array($child) && ($child['@type'] ?? null) === 'Product') {
                    $products[] = $child;
                }
            }
        }

        return $products;
    }
}
