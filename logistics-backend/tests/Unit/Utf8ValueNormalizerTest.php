<?php

namespace Tests\Unit;

use App\Support\Utf8ValueNormalizer;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class Utf8ValueNormalizerTest extends TestCase
{
    public function test_invalid_legacy_bytes_are_substituted_and_logged_without_the_value(): void
    {
        $invalid = "Legacy \xC3\x28";
        Log::shouldReceive('warning')->once()->with(
            'Invalid UTF-8 normalized for customer order API.',
            ['table' => 'order_items', 'record_id' => 991, 'field' => 'product_name']
        );

        $normalized = Utf8ValueNormalizer::string($invalid, 'order_items', 991, 'product_name');

        $this->assertTrue(mb_check_encoding($normalized, 'UTF-8'));
        $this->assertSame('Legacy ?(', $normalized);
    }

    public function test_unicode_line_splitting_does_not_treat_utf8_continuation_bytes_as_newlines(): void
    {
        $lines = Utf8ValueNormalizer::lines("Phân loại: 包装: 3包\nSKU nguồn: sku-包", 'order_items', 992, 'note');

        $this->assertSame(['Phân loại: 包装: 3包', 'SKU nguồn: sku-包'], $lines);
    }
}
