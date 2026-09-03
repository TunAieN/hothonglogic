<?php

namespace App\Services\Shipping;

use App\Models\VnPackage;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Symfony\Component\HttpKernel\Exception\HttpException;

class GhnService
{
    private readonly GhnFeeAudit $feeAudit;

    private readonly GhnInsuranceValueService $insuranceValueService;

    public function __construct(
        private readonly GhnClient $client,
        ?GhnFeeAudit $feeAudit = null,
        ?GhnInsuranceValueService $insuranceValueService = null,
    ) {
        $this->feeAudit = $feeAudit ?? new GhnFeeAudit;
        $this->insuranceValueService = $insuranceValueService ?? new GhnInsuranceValueService;
    }

    public function provinces(): array
    {
        return array_values(array_map(fn (array $row) => [
            'province_id' => (int) $row['ProvinceID'],
            'name' => (string) $row['ProvinceName'],
        ], $this->client->provinces()));
    }

    public function districts(int $provinceId): array
    {
        if ($provinceId <= 0) {
            throw new HttpException(422, 'Mã Tỉnh/Thành phố GHN không hợp lệ. Vui lòng chọn lại.');
        }

        return array_values(array_map(fn (array $row) => [
            'district_id' => (int) $row['DistrictID'],
            'province_id' => (int) $row['ProvinceID'],
            'name' => (string) $row['DistrictName'],
        ], $this->client->districts($provinceId)));
    }

    public function wards(int $districtId): array
    {
        if ($districtId <= 0) {
            throw new HttpException(422, 'Mã Quận/Huyện GHN không hợp lệ. Vui lòng chọn lại.');
        }

        return array_values(array_map(fn (array $row) => [
            'ward_code' => (string) $row['WardCode'],
            'district_id' => (int) $row['DistrictID'],
            'name' => (string) $row['WardName'],
        ], $this->client->wards($districtId)));
    }

    public function quote(array $input, ?Collection $packages = null): array
    {
        $districtId = (int) ($input['to_district_id'] ?? 0);
        $wardCode = trim((string) ($input['to_ward_code'] ?? ''));
        if ($districtId <= 0 || $wardCode === '') {
            throw new HttpException(422, 'Vui lòng chọn đầy đủ Quận/Huyện và Phường/Xã GHN.');
        }

        $this->findWard($districtId, $wardCode);
        $packages ??= $this->loadPackages($input['package_ids'] ?? []);
        $dimensions = $this->aggregatePackages($packages);
        $service = $this->selectService($districtId, isset($input['service_id']) ? (int) $input['service_id'] : null);
        $fromWardCode = trim((string) config('services.ghn.from_ward_code'));
        $fromDistrictId = (int) config('services.ghn.from_district_id');
        if ($fromDistrictId <= 0 || $fromWardCode === '') {
            throw new HttpException(503, 'GHN chưa được cấu hình đầy đủ trên máy chủ.');
        }

        $payload = [
            'service_id' => $service['service_id'],
            'from_district_id' => $fromDistrictId,
            'from_ward_code' => $fromWardCode,
            'to_district_id' => $districtId,
            'to_ward_code' => $wardCode,
            ...$dimensions,
            'insurance_value' => $this->insuranceValueService->clamp((float) ($input['insurance_value'] ?? 0)),
            'cod_value' => min(5_000_000, max(0, (int) round((float) ($input['cod_amount'] ?? 0)))),
            'coupon' => null,
        ];
        $fee = $this->client->calculateFee($payload);
        $this->feeAudit->log('PAYMENT_VOUCHER', [
            ...$payload,
            'service_type_id' => $service['service_type_id'],
        ], $fee);
        if ((float) ($fee['total'] ?? -1) < 0) {
            throw new HttpException(502, 'GHN trả về phí vận chuyển không hợp lệ.');
        }

        $total = (float) ($fee['total'] ?? 0);
        if ($total < 0) {
            throw new HttpException(502, 'GHN trả về phí vận chuyển không hợp lệ.');
        }

        return [
            'total' => $total,
            'service_fee' => (float) ($fee['service_fee'] ?? 0),
            'insurance_fee' => (float) ($fee['insurance_fee'] ?? 0),
            'service_id' => $service['service_id'],
            'service_type_id' => $service['service_type_id'],
            'service_name' => $service['service_name'],
        ];
    }

    public function preview(array $input, Collection $packages): array
    {
        $districtId = (int) ($input['to_district_id'] ?? 0);
        $wardCode = trim((string) ($input['to_ward_code'] ?? ''));
        if ($districtId <= 0 || $wardCode === '') {
            throw new HttpException(422, 'Địa chỉ giao hàng chưa có mã GHN hợp lệ.');
        }

        $this->findWard($districtId, $wardCode);
        $dimensions = $this->aggregatePackages($packages);
        $fromDistrictId = (int) config('services.ghn.from_district_id');
        $fromWardCode = trim((string) config('services.ghn.from_ward_code'));
        if ($fromDistrictId <= 0 || $fromWardCode === '') {
            throw new HttpException(503, 'GHN chưa được cấu hình đầy đủ trên máy chủ.');
        }

        $services = $this->availableServices($fromDistrictId, $districtId);
        $service = $this->chooseService($services, isset($input['service_id']) ? (int) $input['service_id'] : null);
        $routing = [
            'service_id' => $service['service_id'],
            'from_district_id' => $fromDistrictId,
            'from_ward_code' => $fromWardCode,
            'to_district_id' => $districtId,
            'to_ward_code' => $wardCode,
        ];
        $payload = [
            ...$routing,
            ...$dimensions,
            'insurance_value' => $this->insuranceValueService->clamp((float) ($input['insurance_value'] ?? 0)),
            'cod_value' => 0,
            'coupon' => null,
        ];
        $fee = $this->client->calculateFee($payload);
        $this->feeAudit->log('SHIPPING_TASK', [
            ...$payload,
            'service_type_id' => $service['service_type_id'],
        ], $fee);
        $leadtime = $this->client->calculateLeadtime($routing);
        $estimatedAt = $this->parseLeadtime($leadtime['leadtime'] ?? null);

        return [
            'mode' => strtolower(trim((string) config('services.ghn.mode', 'preview'))),
            'services' => $services,
            'service' => $service,
            'current_fee' => (float) ($fee['total'] ?? 0),
            'estimated_delivery_at' => $estimatedAt->toIso8601String(),
            'dimensions' => $dimensions,
        ];
    }

    public function validateDestination(int $provinceId, int $districtId, string $wardCode): array
    {
        $district = collect($this->districts($provinceId))->firstWhere('district_id', $districtId);
        if (! $district) {
            throw new HttpException(422, 'Quận/Huyện không thuộc Tỉnh/Thành phố đã chọn.');
        }

        $ward = $this->findWard($districtId, $wardCode);
        $province = collect($this->provinces())->firstWhere('province_id', $provinceId);
        if (! $province) {
            throw new HttpException(422, 'Tỉnh/Thành phố GHN không hợp lệ.');
        }

        return ['province' => $province, 'district' => $district, 'ward' => $ward];
    }

    private function loadPackages(array $ids): Collection
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
        if ($ids === []) {
            throw new HttpException(422, 'Vui lòng chọn ít nhất một vận đơn.');
        }
        $packages = VnPackage::query()->whereIn('id', $ids)->get();
        if ($packages->count() !== count($ids)) {
            throw new HttpException(422, 'Có vận đơn không tồn tại.');
        }

        return $packages;
    }

    public function aggregatePackages(Collection $packages): array
    {
        foreach ($packages as $package) {
            foreach (['actual_weight', 'actual_length', 'actual_width', 'actual_height'] as $field) {
                if ((float) $package->{$field} <= 0) {
                    throw new HttpException(422, 'Vận đơn '.$package->tracking_number_snapshot.' chưa có đủ cân nặng/kích thước thực tế.');
                }
            }
        }

        return [
            // VnPackage stores weight in kg and dimensions in cm. GHN expects integer grams/cm.
            'weight' => (int) ceil((float) $packages->sum('actual_weight') * 1000),
            'length' => (int) ceil((float) $packages->max('actual_length')),
            'width' => (int) ceil((float) $packages->max('actual_width')),
            'height' => (int) ceil((float) $packages->sum('actual_height')),
        ];
    }

    private function selectService(int $districtId, ?int $serviceId = null): array
    {
        return $this->chooseService($this->availableServices((int) config('services.ghn.from_district_id'), $districtId), $serviceId);
    }

    private function availableServices(int $fromDistrictId, int $toDistrictId): array
    {
        return collect($this->client->availableServices($toDistrictId, $fromDistrictId))
            ->map(fn (array $row) => [
                'service_id' => (int) ($row['service_id'] ?? 0),
                'service_type_id' => (int) ($row['service_type_id'] ?? 0),
                'service_name' => (string) ($row['short_name'] ?? $row['service_name'] ?? 'Dịch vụ GHN'),
            ])
            ->filter(fn (array $row) => $row['service_id'] > 0)
            ->values()
            ->all();
    }

    private function chooseService(array $services, ?int $serviceId = null): array
    {
        $collection = collect($services);
        $selected = $serviceId
            ? $collection->firstWhere('service_id', $serviceId)
            : ($collection->firstWhere('service_type_id', 2) ?? $collection->first());
        if ($serviceId && ! $selected) {
            throw new HttpException(422, 'Dịch vụ GHN đã chọn không còn khả dụng cho tuyến giao hàng này.');
        }
        if (! $selected) {
            throw new HttpException(422, 'GHN không hỗ trợ tuyến giao hàng này.');
        }

        return $selected;
    }

    private function parseLeadtime(mixed $value): Carbon
    {
        if (is_numeric($value) && (int) $value > 0) {
            return Carbon::createFromTimestamp((int) $value, 'UTC')->setTimezone('Asia/Ho_Chi_Minh');
        }
        if (is_string($value) && trim($value) !== '') {
            return Carbon::parse($value)->setTimezone('Asia/Ho_Chi_Minh');
        }

        throw new HttpException(502, 'GHN không trả về thời gian giao dự kiến hợp lệ.');
    }

    private function findWard(int $districtId, string $wardCode): array
    {
        $ward = collect($this->wards($districtId))->firstWhere('ward_code', $wardCode);
        if (! $ward) {
            throw new HttpException(422, 'Phường/Xã GHN không hợp lệ. Vui lòng chọn lại.');
        }

        return $ward;
    }
}
