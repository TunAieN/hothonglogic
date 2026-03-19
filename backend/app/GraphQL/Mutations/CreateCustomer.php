<?php

namespace App\GraphQL\Mutations;

use App\Models\Customer;
use GraphQL\Type\Definition\ResolveInfo;
use Nuwave\Lighthouse\Support\Contracts\GraphQLContext;

class CreateCustomer
{
    /**
     * Tạo khách hàng mới.
     *
     * @param  null  $root
     * @param  array<string, mixed>  $args
     */
    public function __invoke($root, array $args, GraphQLContext $context, ResolveInfo $resolveInfo): Customer
    {
        return Customer::create([
            'code'    => $args['code'],
            'name'    => $args['name'],
            'phone'   => $args['phone'],
            'email'   => $args['email'] ?? null,
            'address' => $args['address'] ?? null,
            'note'    => $args['note'] ?? null,
            'status'  => $args['status'] ?? 'active',
        ]);
    }
}
