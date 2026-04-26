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

    public function create($_, array $args): Customer
    {
        $validated = $this->customerInputService->validateForCreate($args);

        return Customer::create([
            ...$validated,
            'status' => 'active',
        ]);
    }
}
