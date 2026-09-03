<?php

namespace App\GraphQL\Resolvers;

use App\Models\CustomerAddress;
use App\Services\Customers\CustomerAddressService;

class CustomerAddressResolver
{
    public function __construct(private readonly CustomerAddressService $service) {}

    public function list($_, array $args)
    {
        return $this->service->list((int) $args['customer_id']);
    }

    public function create($_, array $args): CustomerAddress
    {
        $input = $args['input'] ?? [];

        return $this->service->create((int) $input['customer_id'], $input);
    }

    public function update($_, array $args): CustomerAddress
    {
        $input = $args['input'] ?? [];

        return $this->service->update((int) $input['customer_id'], (int) $args['id'], $input);
    }

    public function setDefault($_, array $args): CustomerAddress
    {
        return $this->service->setDefault((int) $args['customer_id'], (int) $args['address_id']);
    }
}
