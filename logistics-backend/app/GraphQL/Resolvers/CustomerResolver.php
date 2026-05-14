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
                'phone',
                'email',
                'address',
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

        return Customer::create([
            ...$validated,
            'status' => 'active',
        ]);
    }

    public function update($_, array $args): Customer
    {
        $customer = Customer::query()->findOrFail($args['id']);
        $validated = $this->customerInputService->validateForUpdate($args, $customer);

        $customer->update($validated);

        return $customer->fresh();
    }
}
