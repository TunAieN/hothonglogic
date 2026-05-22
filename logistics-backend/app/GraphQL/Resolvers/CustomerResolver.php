<?php

namespace App\GraphQL\Resolvers;

use App\Models\Customer;
use App\Services\Customers\CustomerInputService;

class CustomerResolver
{
    public function __construct(
        private readonly CustomerInputService $customerInputService
    ) {
    }

     public function list($_, array $args)
    {
        $first = $args['first'] ?? 10;
        $page = $args['page'] ?? 1;

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
            ->paginate($first, ['*'], 'page', $page);
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
}
