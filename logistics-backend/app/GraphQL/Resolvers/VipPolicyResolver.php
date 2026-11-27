<?php

namespace App\GraphQL\Resolvers;

use App\Models\RiskDepositPolicy;
use App\Models\VipTier;
use App\Models\AuditLog;
use App\Services\Auth\PermissionService;
use App\Support\BusinessWriteGuard;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpKernel\Exception\HttpException;

class VipPolicyResolver
{
    public function __construct(private readonly PermissionService $permissions) {}

    public function tiers(): mixed
    {
        return VipTier::query()->withCount('customers')->orderBy('priority')->get();
    }

    public function risks(): mixed
    {
        return RiskDepositPolicy::query()->orderBy('priority')->get();
    }

    public function history(): mixed
    {
        return AuditLog::query()->whereIn('entity_type', ['VipTier', 'RiskDepositPolicy'])->latest('id')->limit(100)->get()
            ->each(function (AuditLog $log): void {
                $log->setAttribute('before_data', $log->getRawOriginal('before_data'));
                $log->setAttribute('after_data', $log->getRawOriginal('after_data'));
            });
    }

    public function updateTier($_, array $args): VipTier
    {
        BusinessWriteGuard::assertEnabled(__METHOD__);
        $this->permissions->authorize(Auth::user(), 'vip_policies.manage');
        $tier = VipTier::query()->findOrFail($args['id']);
        $data = Validator::make($args['input'], [
            'code' => ['required', 'string', 'max:30', Rule::unique('vip_tiers')->ignore($tier->id)],
            'name' => ['required', 'string', 'max:50', Rule::unique('vip_tiers')->ignore($tier->id)],
            'priority' => ['required', 'integer', 'min:0', Rule::unique('vip_tiers')->ignore($tier->id)],
            'minimum_spend_vnd' => ['required', 'integer', 'min:0'], 'base_deposit_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'credit_limit_vnd' => ['nullable', 'integer', 'min:0'], 'deposit_policy_enabled' => ['boolean'], 'is_default' => ['boolean'], 'is_active' => ['boolean'],
        ])->validate();

        return DB::transaction(function () use ($tier, $data) {
            if (($data['is_default'] ?? false) && ! ($data['is_active'] ?? true)) {
                throw new HttpException(422, 'Hạng mặc định phải đang hoạt động.');
            }
            if (($data['deposit_policy_enabled'] ?? false) && $data['base_deposit_percent'] === null) {
                throw new HttpException(422, 'Phải cấu hình tỷ lệ cọc cơ bản trước khi kích hoạt chính sách tài chính.');
            }
            if (($data['deposit_policy_enabled'] ?? false) && (! Schema::hasColumn('risk_deposit_policies', 'surcharge_percent') || RiskDepositPolicy::query()->where('is_active', true)->whereNull('surcharge_percent')->exists())) {
                throw new HttpException(422, 'Chưa thể kích hoạt: mọi mức rủi ro đang hoạt động phải có phụ thêm được phê duyệt.');
            }
            if ($data['is_default'] ?? false) {
                VipTier::query()->whereKeyNot($tier->id)->where('is_default', true)->lockForUpdate()->update(['is_default' => false]);
            }
            $conflict = VipTier::query()->whereKeyNot($tier->id)->where('is_active', true)->where('minimum_spend_vnd', $data['minimum_spend_vnd'])->exists();
            if (($data['is_active'] ?? true) && $conflict) {
                throw new HttpException(422, 'Ngưỡng chi tiêu của hạng đang hoạt động không được trùng nhau.');
            }
            $before = $tier->toArray();
            $tier->update([...$data, 'updated_by' => Auth::id()]);
            if (VipTier::query()->where('is_active', true)->where('is_default', true)->count() !== 1) {
                throw new HttpException(422, 'Phải có đúng một hạng VIP mặc định đang hoạt động.');
            }
            $thresholds = VipTier::query()->where('is_active', true)->orderBy('priority')->pluck('minimum_spend_vnd')->map(fn ($value) => (int) $value)->all();
            if ($thresholds !== array_values(array_unique($thresholds)) || $thresholds !== collect($thresholds)->sort()->values()->all()) {
                throw new HttpException(422, 'Ngưỡng chi tiêu phải tăng dần theo thứ tự ưu tiên và không được trùng.');
            }
            $this->audit('update_vip_tier_policy', $tier, $before);

            return $tier->fresh()->loadCount('customers');
        }, 3);
    }

    public function updateRisk($_, array $args): RiskDepositPolicy
    {
        BusinessWriteGuard::assertEnabled(__METHOD__);
        $this->permissions->authorize(Auth::user(), 'deposit_policies.manage');
        $risk = RiskDepositPolicy::query()->findOrFail($args['id']);
        $data = Validator::make($args['input'], [
            'name' => ['required', 'string', 'max:50', Rule::unique('risk_deposit_policies')->ignore($risk->id)],
            'priority' => ['required', 'integer', 'min:0', Rule::unique('risk_deposit_policies')->ignore($risk->id)],
            'minimum_deposit_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'surcharge_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'requires_manager_approval' => ['boolean'], 'is_active' => ['boolean'],
        ])->validate();
        return DB::transaction(function () use ($risk, $data) {
            if ($risk->code === 'special' && ! ($data['requires_manager_approval'] ?? false)) {
                throw new HttpException(422, 'Rủi ro Đặc biệt bắt buộc phải có quản lý phê duyệt.');
            }
            $before = $risk->toArray();
            $risk->update([...$data, 'updated_by' => Auth::id()]);
            $surcharges = RiskDepositPolicy::query()->where('is_active', true)->orderBy('priority')->pluck('surcharge_percent')
                ->filter(fn ($value) => $value !== null)->map(fn ($value) => (float) $value)->values()->all();
            if (count($surcharges) !== count(array_unique($surcharges))) {
                throw new HttpException(422, 'Phụ thêm của các mức rủi ro đang hoạt động không được trùng nhau.');
            }
            if ($surcharges !== collect($surcharges)->sort()->values()->all()) {
                throw new HttpException(422, 'Phụ thêm rủi ro phải tăng dần theo thứ tự ưu tiên.');
            }
            $this->audit('update_risk_deposit_policy', $risk, $before);

            return $risk->fresh();
        }, 3);
    }

    private function audit(string $action, object $entity, array $before): void
    {
        AuditLog::query()->create([
            'user_id' => Auth::id(), 'action' => $action, 'entity_type' => class_basename($entity),
            'entity_id' => $entity->id, 'before_data' => $before, 'after_data' => $entity->fresh()->toArray(),
            'ip' => request()?->ip(), 'user_agent' => request()?->userAgent(), 'created_at' => now(),
        ]);
    }
}
