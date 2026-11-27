<?php

namespace Tests\Unit;

use App\Services\Payments\SepayAccountRegistry;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

class SepayAccountRegistryTest extends TestCase
{
    #[DataProvider('bankCodes')]
    public function test_bank_codes_are_normalized_for_sepay_matching(string $input, string $expected): void
    {
        $method = new ReflectionMethod(SepayAccountRegistry::class, 'normalize');

        $this->assertSame($expected, $method->invoke(new SepayAccountRegistry, $input));
    }

    public static function bankCodes(): array
    {
        return [
            'local MB code' => ['MB', 'MB'],
            'SePay MBBank gateway' => ['MBBank', 'MB'],
            'spacing and case' => [' mb bank ', 'MB'],
            'unrelated bank remains unchanged' => ['VCB', 'VCB'],
        ];
    }
}
