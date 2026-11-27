<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\RiskDepositPolicy;
use App\Models\VipTier;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Console\Command\Command as CommandStatus;

class SetVipDepositPolicyActivation extends Command
{
    protected $signature = 'vip-deposit-policy:set
        {state : enabled or disabled}
        {--confirm= : Exact owner confirmation token}';

    protected $description = 'Atomically enable or disable all approved VIP deposit tiers with an audit trail.';

    private const ENABLE_TOKEN = 'ENABLE-VIP-RISK-POLICY';
    private const DISABLE_TOKEN = 'DISABLE-VIP-RISK-POLICY';

    private const VIP_RATES = [
        'bronze' => 60.0,
        'silver' => 50.0,
        'gold' => 40.0,
        'platinum' => 30.0,
    ];

    private const RISK_SURCHARGES = [
        'low' => 5.0,
        'medium' => 10.0,
        'high' => 20.0,
        'special' => 30.0,
    ];

    public function handle(): int
    {
        $state = strtolower(trim((string) $this->argument('state')));
        if (! in_array($state, ['enabled', 'disabled'], true)) {
            $this->error('State must be enabled or disabled.');

            return CommandStatus::INVALID;
        }

        $expectedToken = $state === 'enabled' ? self::ENABLE_TOKEN : self::DISABLE_TOKEN;
        if (! hash_equals($expectedToken, (string) $this->option('confirm'))) {
            $this->error('Owner confirmation token is missing or invalid; no database write was attempted.');

            return CommandStatus::FAILURE;
        }

        $this->assertProductionConnection();
        $targetEnabled = $state === 'enabled';

        DB::transaction(function () use ($state, $targetEnabled): void {
            $migrationCount = DB::table('migrations')->whereIn('migration', [
                '2026_11_25_000051_create_vip_and_order_deposit_policy_domain',
                '2026_11_26_000052_add_risk_surcharge_policy',
            ])->count();
            if ($migrationCount !== 2) {
                throw new \RuntimeException('Migrations 051 and 052 must both be Ran.');
            }

            $tiers = VipTier::query()->whereIn('code', array_keys(self::VIP_RATES))
                ->orderBy('priority')->lockForUpdate()->get()->keyBy('code');
            $risks = RiskDepositPolicy::query()->whereIn('code', array_keys(self::RISK_SURCHARGES))
                ->orderBy('priority')->lockForUpdate()->get()->keyBy('code');

            if ($tiers->count() !== 4 || $risks->count() !== 4) {
                throw new \RuntimeException('Exactly four approved VIP tiers and four risk policies are required.');
            }

            foreach (self::VIP_RATES as $code => $rate) {
                $tier = $tiers->get($code);
                if (! $tier || ! $tier->is_active || abs((float) $tier->base_deposit_percent - $rate) > 0.001) {
                    throw new \RuntimeException("VIP tier {$code} does not match the approved active configuration.");
                }
                if ((bool) $tier->deposit_policy_enabled === $targetEnabled) {
                    throw new \RuntimeException("VIP tier {$code} is already in the requested state; refusing a partial or duplicate activation.");
                }
            }

            foreach (self::RISK_SURCHARGES as $code => $surcharge) {
                $risk = $risks->get($code);
                if (! $risk || ! $risk->is_active || abs((float) $risk->surcharge_percent - $surcharge) > 0.001) {
                    throw new \RuntimeException("Risk policy {$code} does not match the approved active configuration.");
                }
            }
            if (! $risks->get('special')?->requires_manager_approval) {
                throw new \RuntimeException('Special risk must require manager approval.');
            }

            foreach ($tiers as $tier) {
                $before = $tier->toArray();
                $tier->forceFill([
                    'deposit_policy_enabled' => $targetEnabled,
                ])->save();

                AuditLog::query()->create([
                    'user_id' => null,
                    'action' => $state === 'enabled'
                        ? 'enable_vip_deposit_policy_owner_approved'
                        : 'disable_vip_deposit_policy_rollback',
                    'entity_type' => 'VipTier',
                    'entity_id' => $tier->id,
                    'before_data' => $before,
                    'after_data' => $tier->fresh()->toArray(),
                    'ip' => '127.0.0.1',
                    'user_agent' => 'Laravel CLI atomic VIP policy activation',
                    'created_at' => now(),
                ]);
            }

            $enabledCount = VipTier::query()->whereIn('code', array_keys(self::VIP_RATES))
                ->where('deposit_policy_enabled', true)->count();
            $expectedCount = $targetEnabled ? 4 : 0;
            if ($enabledCount !== $expectedCount) {
                throw new \RuntimeException('Post-write verification failed; the transaction will roll back.');
            }
        }, 3);

        $this->info(sprintf(
            'VIP deposit policy state changed atomically to %s for 4 tiers; audit rows were recorded.',
            $state,
        ));

        return CommandStatus::SUCCESS;
    }

    private function assertProductionConnection(): void
    {
        $connection = DB::connection();
        $identity = DB::selectOne(
            "SELECT CURRENT_USER() AS account, DATABASE() AS db, @@port AS port, @@version AS version",
        );
        $tls = DB::selectOne("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
        $cipher = (string) ($tls->Value ?? $tls->value ?? '');

        if (
            $connection->getDriverName() !== 'mysql'
            || (string) $identity->account !== 'viettrung_app@127.0.0.1'
            || (string) $identity->db !== 'logistics_system'
            || (int) $identity->port !== 3310
            || $cipher === ''
        ) {
            throw new \RuntimeException('Refusing activation: production identity, database, port, or TLS verification failed.');
        }
    }
}
