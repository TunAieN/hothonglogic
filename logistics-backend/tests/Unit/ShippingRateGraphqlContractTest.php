<?php

namespace Tests\Unit;

use Nuwave\Lighthouse\Schema\Types\Scalars\Date;
use PHPUnit\Framework\TestCase;

class ShippingRateGraphqlContractTest extends TestCase
{
    public function test_shipping_rate_date_scalar_accepts_date_only_values(): void
    {
        $date = (new Date)->parseValue('2026-02-02');

        $this->assertSame('2026-02-02', $date->toDateString());
    }

    public function test_shipping_rate_frontend_strips_read_only_detail_ids(): void
    {
        $source = file_get_contents(dirname(__DIR__, 3).'/admin-panel/src/pages/shipping-rates/api.ts');

        $this->assertStringContainsString('Array<Omit<ShippingRateDetail, "id">>', $source);
        $this->assertStringContainsString('details: input.details.map((detail) => ({', $source);
        $this->assertStringNotContainsString('details: input.details.map((detail) => ({ ...detail', $source);
    }
}
