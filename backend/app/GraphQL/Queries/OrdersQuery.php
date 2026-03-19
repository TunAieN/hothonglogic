<?php

namespace App\GraphQL\Queries;

use App\Models\Order;
use GraphQL\Type\Definition\ResolveInfo;
use Nuwave\Lighthouse\Support\Contracts\GraphQLContext;

class OrdersQuery
{
    /**
     * Trả về danh sách đơn hàng kèm khách hàng và sản phẩm.
     *
     * @param  null  $root
     * @param  array<string, mixed>  $args
     */
    public function __invoke($root, array $args, GraphQLContext $context, ResolveInfo $resolveInfo)
    {
        return Order::with(['customer', 'items'])
            ->latest()
            ->paginate(20)
            ->items(); // Trả về array thay vì paginator để Lighthouse tự handle
    }
}
