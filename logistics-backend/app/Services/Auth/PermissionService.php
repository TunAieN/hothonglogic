<?php

namespace App\Services\Auth;

use App\Models\User;
use Symfony\Component\HttpKernel\Exception\HttpException;

class PermissionService
{
    private const LEGACY_ALIASES = [
        'shipping_queue.read' => ['exports.read', 'export.view'],
        'shipping_tasks.read' => ['exports.read', 'export.view'],
        'shipping_tasks.create' => ['exports.create', 'export.create'],
        'shipping_tasks.update' => ['exports.update', 'export.update'],
        'shipping_tasks.complete' => ['exports.update', 'export.update'],
        'export_slips.read' => ['exports.read', 'export.view'],
        'export_slips.create' => ['exports.create', 'export.create'],
        'export_slips.update' => ['exports.update', 'export.update'],
        'payment_vouchers.read' => ['payments.all'],
        'payment_vouchers.create' => ['payments.all'],
        'payment_vouchers.update' => ['payment_vouchers.cancel', 'payments.all'],
        'payments.confirm' => ['payment_transactions.confirm', 'payments.all'],
        'invoices.create' => ['invoices.issue', 'invoices.all'],
        'invoices.update' => ['invoices.issue', 'invoices.all'],
        'exchange_rates.update' => ['exchange_rates.manage', 'settings.all'],
    ];

    public function allows(?User $user, string $permission): bool
    {
        if (! $user || $user->status !== 'active') {
            return false;
        }

        $permissions = $user->role?->permissions ?? [];
        if (in_array('all', $permissions, true) || in_array($permission, $permissions, true)) {
            return true;
        }

        foreach (self::LEGACY_ALIASES[$permission] ?? [] as $legacyPermission) {
            if (in_array($legacyPermission, $permissions, true)) {
                return true;
            }
        }

        return false;
    }

    public function authorize(?User $user, string $permission): void
    {
        if (! $this->allows($user, $permission)) {
            throw new HttpException(403, 'Bạn không có quyền thực hiện thao tác này.');
        }
    }
}
