<?php

namespace App\GraphQL\Resolvers;

use App\Models\Customer;
use App\Services\Customers\CustomerInputService;
use Illuminate\Database\Eloquent\Builder;

class CustomerResolver
{
    public function __construct(
        private readonly CustomerInputService $customerInputService
    ) {}

    public function list($_, array $args): Builder
    {
        $filter = $args['filter'] ?? [];

        return Customer::query()
            ->select([
                'id',
                'code',
                'name',
                'vip_group',
                'phone',
                'email',
                'province',
                'district',
                'ward',
                'address',
                'note',
                'status',
                'created_at',
            ])
            ->withCount('orders')
            ->when($this->filled($filter, 'search'), function (Builder $query) use ($filter) {
                $search = trim((string) $filter['search']);

                $query->where(function (Builder $nestedQuery) use ($search) {
                    $nestedQuery
                        ->where('code', 'like', '%'.$search.'%')
                        ->orWhere('name', 'like', '%'.$search.'%')
                        ->orWhere('phone', 'like', '%'.$search.'%')
                        ->orWhere('email', 'like', '%'.$search.'%')
                        ->orWhere('province', 'like', '%'.$search.'%')
                        ->orWhere('district', 'like', '%'.$search.'%')
                        ->orWhere('ward', 'like', '%'.$search.'%')
                        ->orWhere('address', 'like', '%'.$search.'%');
                });
            })
            ->when($this->filled($filter, 'status'), fn (Builder $query) => $query->where(
                'status',
                $filter['status'],
            ))
            ->when($this->filled($filter, 'vip_group'), function (Builder $query) use ($filter) {
                $query->where('vip_group', 'like', '%'.trim((string) $filter['vip_group']).'%');
            })
            ->when($this->filled($filter, 'province'), function (Builder $query) use ($filter) {
                $query->where('province', 'like', '%'.trim((string) $filter['province']).'%');
            })
            ->when($this->filled($filter, 'phone'), function (Builder $query) use ($filter) {
                $query->where('phone', 'like', '%'.trim((string) $filter['phone']).'%');
            })
            ->when($this->filled($filter, 'created_from'), fn (Builder $query) => $query->where(
                'created_at',
                '>=',
                $filter['created_from'],
            ))
            ->when($this->filled($filter, 'created_to'), fn (Builder $query) => $query->where(
                'created_at',
                '<=',
                $filter['created_to'],
            ))
            ->latest('created_at')
            ->latest('id');
    }

    public function show($_, array $args): Customer
    {
        return Customer::query()
            ->withCount('orders')
            ->findOrFail($args['id']);
    }

    public function create($_, array $args): Customer
    {
        $validated = $this->customerInputService->validateForCreate($args);
        $code = $this->customerInputService->generateCustomerCode();
        $this->customerInputService->validateGeneratedCode($code);

        $customer = Customer::create([
            ...$validated,
            'code' => $code,
            'status' => 'active',
        ]);

        return $customer->loadCount('orders');
    }

    public function update($_, array $args): Customer
    {
        $customer = Customer::query()->findOrFail($args['id']);
        $validated = $this->customerInputService->validateForUpdate($args, $customer);

        $customer->update($validated);

        return $customer->fresh()->loadCount('orders');
    }

    public function delete($_, array $args): Customer
    {
        $customer = Customer::query()
            ->withCount('orders')
            ->findOrFail($args['id']);

        $deletedCustomer = $customer->replicate();
        $deletedCustomer->setAttribute('id', $customer->id);
        $deletedCustomer->setAttribute('orders_count', $customer->orders_count ?? 0);

        $customer->delete();

        return $deletedCustomer;
    }

    private function filled(array $values, string $key): bool
    {
        if (! array_key_exists($key, $values)) {
            return false;
        }

        $value = $values[$key];

        return $value !== null && trim((string) $value) !== '';
    }
}
