<?php

namespace Tests\Unit;

use App\Exceptions\BusinessWritesLockedException;
use App\Exceptions\FinancialWritesLockedException;
use App\Support\BusinessWriteGuard;
use Illuminate\Support\Facades\Config;
use Tests\TestCase;

class BusinessWriteGuardTest extends TestCase
{
    public function test_missing_configuration_fails_closed(): void
    {
        Config::set('business.writes_enabled', null);

        $this->expectException(BusinessWritesLockedException::class);
        BusinessWriteGuard::assertEnabled('test.missing-config');
    }

    public function test_false_configuration_blocks_business_writes_with_stable_code(): void
    {
        Config::set('business.writes_enabled', false);

        try {
            BusinessWriteGuard::assertEnabled('test.locked');
            $this->fail('The business write guard did not block the operation.');
        } catch (BusinessWritesLockedException $exception) {
            $this->assertSame('BUSINESS_WRITES_LOCKED', $exception->getExtensions()['code']);
            $this->assertSame('test.locked', $exception->getExtensions()['operation']);
        }
    }

    public function test_only_literal_boolean_true_enables_business_writes(): void
    {
        Config::set('business.writes_enabled', true);
        BusinessWriteGuard::assertEnabled('test.enabled');
        $this->addToAssertionCount(1);

        Config::set('business.writes_enabled', 'true');
        $this->expectException(BusinessWritesLockedException::class);
        BusinessWriteGuard::assertEnabled('test.string-is-not-enough');
    }

    public function test_financial_writes_require_both_switches(): void
    {
        Config::set('business.writes_enabled', true);
        Config::set('business.financial_writes_enabled', false);

        try {
            BusinessWriteGuard::assertFinancialEnabled('test.financial-locked');
            $this->fail('The financial write guard did not block the operation.');
        } catch (FinancialWritesLockedException $exception) {
            $this->assertSame('FINANCIAL_WRITES_LOCKED', $exception->getExtensions()['code']);
            $this->assertSame('test.financial-locked', $exception->getExtensions()['operation']);
        }

        Config::set('business.financial_writes_enabled', true);
        BusinessWriteGuard::assertFinancialEnabled('test.financial-enabled');
        $this->addToAssertionCount(1);
    }

    public function test_financial_switch_cannot_bypass_global_lock(): void
    {
        Config::set('business.writes_enabled', false);
        Config::set('business.financial_writes_enabled', true);

        $this->expectException(BusinessWritesLockedException::class);
        BusinessWriteGuard::assertFinancialEnabled('test.global-lock');
    }
}
