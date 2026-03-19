<?php

namespace App\GraphQL\Mutations;

use App\Models\Order;
use App\Models\OrderItem;
use Carbon\Carbon;
use GraphQL\Type\Definition\ResolveInfo;
use Illuminate\Support\Facades\DB;
use Nuwave\Lighthouse\Support\Contracts\GraphQLContext;

class CreateOrder
{
    /**
     * Tạo đơn hàng mới kèm danh sách sản phẩm.
     *
     * @param  null  $root
     * @param  array<string, mixed>  $args
     */
    public function __invoke($root, array $args, GraphQLContext $context, ResolveInfo $resolveInfo): Order
    {
        return DB::transaction(function () use ($args) {
            // 1. Tạo mã đơn hàng theo ngày
            $date     = Carbon::now()->format('Ymd');
            $count    = Order::whereDate('created_at', Carbon::today())->count() + 1;
            $sequence = str_pad($count, 4, '0', STR_PAD_LEFT);
            $orderCode = "ORD-{$date}-{$sequence}";

            // 2. Tính tổng tiền
            $totalAmount = collect($args['items'])->sum(
                fn($item) => $item['price_cny'] * $item['quantity']
            );

            // 3. Tạo đơn hàng
            $order = Order::create([
                'order_code'  => $orderCode,
                'customer_id' => $args['customer_id'],
                'status'      => 'pending',
                'total_amount' => $totalAmount,
                'note'        => $args['note'] ?? null,
                'created_by'  => 1, // Hardcode admin cho đến khi có auth
            ]);

            // 4. Tạo các sản phẩm trong đơn
            foreach ($args['items'] as $item) {
                OrderItem::create([
                    'order_id'      => $order->id,
                    'product_name'  => $item['product_name'],
                    'product_link'  => $item['product_link'] ?? null,
                    'price_cny'     => $item['price_cny'],
                    'quantity'      => $item['quantity'],
                    'note'          => $item['note'] ?? null,
                    'product_image' => $item['product_image'] ?? null,
                ]);
            }

            return $order->load(['customer', 'items']);
        });
    }
}
