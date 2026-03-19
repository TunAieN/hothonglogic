<?php

namespace App\GraphQL\Mutations;

use App\Models\Customer;
use GraphQL\Type\Definition\ResolveInfo;
use Nuwave\Lighthouse\Support\Contracts\GraphQLContext;

class UpdateCustomer
{
    /**
     * Cập nhật thông tin khách hàng.
     *
     * @param  null  $root
     * @param  array<string, mixed>  $args
     */
    public function __invoke($root, array $args, GraphQLContext $context, ResolveInfo $resolveInfo): Customer
    {
        $customer = Customer::findOrFail($args['id']);

        $data = array_filter([
            'code'    => $args['code'] ?? null,
            'name'    => $args['name'] ?? null,
            'phone'   => $args['phone'] ?? null,
            'email'   => $args['email'] ?? null,
            'address' => $args['address'] ?? null,
            'note'    => $args['note'] ?? null,
            'status'  => $args['status'] ?? null,
        ], fn($v) => $v !== null);

        $customer->update($data);

        return $customer->fresh();
    }
}
