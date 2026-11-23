<?php

namespace Tests\Unit;

use App\Services\Payments\CustomerLedgerService;
use LogicException;
use OverflowException;
use PHPUnit\Framework\TestCase;

class CustomerLedgerServiceTest extends TestCase
{
    private CustomerLedgerService $ledger;

    protected function setUp(): void
    {
        parent::setUp();
        $this->ledger = new CustomerLedgerService;
    }

    /** @dataProvider exactVndValues */
    public function test_vnd_accepts_only_exact_whole_values(mixed $input, int $expected): void
    {
        $this->assertSame($expected, $this->ledger->vnd($input));
    }

    public static function exactVndValues(): array
    {
        return [
            'integer' => [125000, 125000],
            'decimal storage' => ['125000.00', 125000],
            'zero' => ['0.0', 0],
            'negative anomaly remains visible' => ['-1.00', -1],
        ];
    }

    /** @dataProvider inexactVndValues */
    public function test_vnd_rejects_rounding_and_ambiguous_formats(mixed $input): void
    {
        $this->expectException(LogicException::class);
        $this->ledger->vnd($input);
    }

    public static function inexactVndValues(): array
    {
        return [
            'fraction' => ['100.01'],
            'scientific notation' => ['1e5'],
            'thousands separator' => ['100,000'],
            'empty' => [''],
        ];
    }

    public function test_vnd_rejects_values_above_domain_limit(): void
    {
        $this->expectException(OverflowException::class);
        $this->ledger->vnd((string) (CustomerLedgerService::MAX_VND + 1));
    }
}
