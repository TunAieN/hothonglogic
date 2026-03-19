<?php

namespace App\GraphQL\Mutations;

use App\Models\Customer;
use GraphQL\Type\Definition\ResolveInfo;
use Nuwave\Lighthouse\Support\Contracts\GraphQLContext;

class DeleteCustomer
{
    /**
     * Xóa khách hàng. Không cho xóa nếu đã có đơn hàng.
     *
     * @param  null  $root
     * @param  array<string, mixed>  $args
     * @return array{success: bool, message: string}
     */
    public function __invoke($root, array $args, GraphQLContext $context, ResolveInfo $resolveInfo): array
    {
        $customer = Customer::findOrFail($args['id']);

        if ($customer->orders()->exists()) {
            return [
                'success' => false,
                'message' => 'Không thể xóa khách hàng đã có đơn hàng',
            ];
        }

        $customer->delete();

        return [
            'success' => true,
            'message' => 'Xóa khách hàng thành công',
        ];
    }
}
