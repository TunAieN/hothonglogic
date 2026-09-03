<?php

namespace Tests\Unit;

use App\Models\VnPackage;
use App\Services\Shipping\GhnClient;
use App\Services\Shipping\GhnService;
use Carbon\Carbon;
use Mockery;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class GhnServiceTest extends TestCase
{
    public function test_wards_rejects_an_invalid_district_before_calling_ghn(): void
    {
        $client = Mockery::mock(GhnClient::class);
        $client->shouldNotReceive('wards');

        $this->expectException(HttpException::class);
        $this->expectExceptionMessage('Mã Quận/Huyện GHN không hợp lệ. Vui lòng chọn lại.');

        (new GhnService($client))->wards(0);
    }

    public function test_districts_rejects_an_invalid_province_before_calling_ghn(): void
    {
        $client = Mockery::mock(GhnClient::class);
        $client->shouldNotReceive('districts');

        $this->expectException(HttpException::class);
        $this->expectExceptionMessage('Mã Tỉnh/Thành phố GHN không hợp lệ. Vui lòng chọn lại.');

        (new GhnService($client))->districts(0);
    }

    public function test_quote_uses_database_measurements_and_prefers_light_service(): void
    {
        config([
            'services.ghn.from_district_id' => 1454,
            'services.ghn.from_ward_code' => '21211',
        ]);
        $client = Mockery::mock(GhnClient::class);
        $client->shouldReceive('wards')->once()->with(1482)->andReturn([
            ['WardCode' => '1A0607', 'DistrictID' => 1482, 'WardName' => 'Mỹ Đình 2'],
        ]);
        $client->shouldReceive('availableServices')->once()->with(1482, 1454)->andReturn([
            ['service_id' => 100, 'service_type_id' => 5, 'short_name' => 'Khác'],
            ['service_id' => 200, 'service_type_id' => 2, 'short_name' => 'Hàng nhẹ'],
        ]);
        $client->shouldReceive('calculateFee')->once()->with(Mockery::on(function (array $payload) {
            return $payload['service_id'] === 200
                && $payload['weight'] === 1800
                && $payload['length'] === 30
                && $payload['width'] === 20
                && $payload['height'] === 25;
        }))->andReturn(['total' => 34000, 'service_fee' => 32000, 'insurance_fee' => 2000]);

        $packages = collect([
            new VnPackage(['tracking_number_snapshot' => 'A', 'actual_weight' => 1.2, 'actual_length' => 30, 'actual_width' => 20, 'actual_height' => 10]),
            new VnPackage(['tracking_number_snapshot' => 'B', 'actual_weight' => 0.6, 'actual_length' => 15, 'actual_width' => 10, 'actual_height' => 15]),
        ]);

        $quote = (new GhnService($client))->quote([
            'to_district_id' => 1482,
            'to_ward_code' => '1A0607',
            'insurance_value' => 500000,
        ], $packages);

        $this->assertSame(34000.0, $quote['total']);
        $this->assertSame(200, $quote['service_id']);
        $this->assertSame(2, $quote['service_type_id']);
    }

    public function test_quote_rejects_an_unsupported_route(): void
    {
        config(['services.ghn.from_district_id' => 1454, 'services.ghn.from_ward_code' => '21211']);
        $client = Mockery::mock(GhnClient::class);
        $client->shouldReceive('wards')->once()->andReturn([
            ['WardCode' => '1A0607', 'DistrictID' => 1482, 'WardName' => 'Mỹ Đình 2'],
        ]);
        $client->shouldReceive('availableServices')->once()->with(1482, 1454)->andReturn([]);

        $this->expectException(HttpException::class);
        $this->expectExceptionMessage('GHN không hỗ trợ tuyến giao hàng này.');

        (new GhnService($client))->quote([
            'to_district_id' => 1482,
            'to_ward_code' => '1A0607',
        ], collect([new VnPackage([
            'tracking_number_snapshot' => 'A', 'actual_weight' => 1,
            'actual_length' => 20, 'actual_width' => 15, 'actual_height' => 10,
        ])]));
    }

    public function test_quote_rejects_an_unknown_ward(): void
    {
        $client = Mockery::mock(GhnClient::class);
        $client->shouldReceive('wards')->once()->andReturn([]);

        $this->expectException(HttpException::class);
        $this->expectExceptionMessage('Phường/Xã GHN không hợp lệ. Vui lòng chọn lại.');

        (new GhnService($client))->quote([
            'to_district_id' => 1482,
            'to_ward_code' => 'INVALID',
        ], collect());
    }

    public function test_preview_converts_ghn_leadtime_to_vietnam_timezone(): void
    {
        config([
            'services.ghn.mode' => 'preview',
            'services.ghn.from_district_id' => 1454,
            'services.ghn.from_ward_code' => '21211',
        ]);
        $timestamp = Carbon::parse('2026-09-05 01:00:00', 'UTC')->timestamp;
        $client = Mockery::mock(GhnClient::class);
        $client->shouldReceive('wards')->once()->with(1482)->andReturn([
            ['WardCode' => '1A0607', 'DistrictID' => 1482, 'WardName' => 'Mỹ Đình 2'],
        ]);
        $client->shouldReceive('availableServices')->once()->with(1482, 1454)->andReturn([
            ['service_id' => 200, 'service_type_id' => 2, 'short_name' => 'Hàng nhẹ'],
        ]);
        $client->shouldReceive('calculateFee')->once()->andReturn(['total' => 1031620]);
        $client->shouldReceive('calculateLeadtime')->once()->andReturn(['leadtime' => $timestamp]);
        $packages = collect([new VnPackage([
            'tracking_number_snapshot' => 'A', 'actual_weight' => 12,
            'actual_length' => 100, 'actual_width' => 100, 'actual_height' => 100,
        ])]);

        $preview = (new GhnService($client))->preview([
            'to_district_id' => 1482,
            'to_ward_code' => '1A0607',
        ], $packages);

        $this->assertSame('2026-09-05T08:00:00+07:00', $preview['estimated_delivery_at']);
    }
}
