<?php

namespace App\Services\Shipping;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpKernel\Exception\HttpException;

class GhnClient
{
    public function provinces(): array
    {
        return $this->request('get', '/master-data/province');
    }

    public function districts(int $provinceId): array
    {
        return $this->request('post', '/master-data/district', ['province_id' => $provinceId]);
    }

    public function wards(int $districtId): array
    {
        return $this->request('post', '/master-data/ward', ['district_id' => $districtId]);
    }

    public function availableServices(int $toDistrictId, ?int $fromDistrictId = null): array
    {
        return $this->request('post', '/v2/shipping-order/available-services', [
            'shop_id' => $this->integerConfig('shop_id'),
            'from_district' => $fromDistrictId ?: $this->integerConfig('from_district_id'),
            'to_district' => $toDistrictId,
        ]);
    }

    public function calculateFee(array $payload): array
    {
        return $this->request('post', '/v2/shipping-order/fee', $payload);
    }

    public function calculateLeadtime(array $payload): array
    {
        return $this->request('post', '/v2/shipping-order/leadtime', $payload);
    }

    public function createOrder(array $payload): array
    {
        $mode = strtolower(trim((string) config('services.ghn.mode', 'preview')));
        if ($mode !== 'production') {
            throw new HttpException(403, 'GHN production order creation is disabled in '.$mode.' mode.');
        }

        throw new HttpException(501, 'GHN production order creation is not implemented.');
    }

    private function request(string $method, string $path, array $payload = []): array
    {
        try {
            $response = $this->http()->{$method}($path, $payload);
        } catch (ConnectionException $exception) {
            throw new HttpException(504, 'Không thể kết nối GHN. Vui lòng thử lại.', $exception);
        }

        if (! $response->successful()) {
            $message = $response->json('message') ?: $response->json('code_message_value') ?: 'GHN đang tạm thời không phản hồi.';
            throw new HttpException(502, 'GHN: '.$message);
        }

        $body = $response->json();
        if (! is_array($body)) {
            throw new HttpException(502, 'GHN trả về dữ liệu không hợp lệ.');
        }

        if ((int) ($body['code'] ?? 0) !== 200) {
            $message = $body['message'] ?? $body['code_message_value'] ?? 'Yêu cầu GHN không thành công.';
            throw new HttpException(422, 'GHN: '.$message);
        }

        return is_array($body['data'] ?? null) ? $body['data'] : [];
    }

    private function http(): PendingRequest
    {
        $mode = strtolower(trim((string) config('services.ghn.mode', 'preview')));
        if (! in_array($mode, ['preview', 'test', 'production'], true)) {
            throw new HttpException(503, 'GHN_MODE không hợp lệ. Chỉ hỗ trợ preview, test hoặc production.');
        }
        $baseUrl = rtrim((string) config($mode === 'test' ? 'services.ghn.test_base_url' : 'services.ghn.base_url'), '/');
        $token = trim((string) config('services.ghn.token'));
        $shopId = trim((string) config('services.ghn.shop_id'));

        if ($baseUrl === '' || $token === '' || $shopId === '') {
            throw new HttpException(503, 'GHN chưa được cấu hình đầy đủ trên máy chủ.');
        }

        return Http::baseUrl($baseUrl)
            ->acceptJson()
            ->asJson()
            ->withHeaders(['Token' => $token, 'ShopId' => $shopId])
            ->connectTimeout(5)
            ->timeout(15);
    }

    private function integerConfig(string $key): int
    {
        $value = filter_var(config('services.ghn.'.$key), FILTER_VALIDATE_INT);
        if ($value === false || $value <= 0) {
            throw new HttpException(503, 'GHN chưa được cấu hình đầy đủ trên máy chủ.');
        }

        return $value;
    }
}
