<?php

namespace App\GraphQL\Resolvers;

use App\Models\Role;
use Illuminate\Database\Eloquent\Collection;

class RoleResolver
{
    public function list(): Collection
    {
        $canonicalOrder = [
            'admin',
            'sales_staff',
            'customer_service',
            'china_warehouse_staff',
            'vietnam_warehouse_staff',
            'accountant',
            'shipping_staff',
        ];

        return Role::query()
            ->whereIn('key', $canonicalOrder)
            ->get()
            ->sortBy(fn (Role $role): int => array_search($role->key, $canonicalOrder, true))
            ->values();
    }
}
