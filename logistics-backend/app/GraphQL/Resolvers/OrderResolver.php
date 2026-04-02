<?php
namespace App\GraphQL\Resolvers;
use App\Models\Order;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class OrderResolver
{   
    public function orders()
    {
        return Order::with(['customer', 'items'])->get();
    }
    public function create($_, array $args)
    {
        if (!Auth::check()) {
            throw new \Exception('Unauthenticated. Please login to create an order.');
        }

        return DB::transaction(function () use ($args) {

            $input = $args['input'];

            // Tính tổng tiền
            $total = collect($input['items'])->sum(function ($item) {
                return $item['price_cny'] * $item['quantity'];
            });

            // Tạo order
            $order = Order::create([
                'order_code'  => 'ORD-' . date('Ymd') . '-' . strtoupper(substr(uniqid(), -6)),
                'customer_id' => $input['customer_id'],
                'total_amount' => $total,
                'status'      => 'pending',
                'created_by'  => Auth::id(),
            ]);

            // Tạo items
            foreach ($input['items'] as $item) {
                $order->items()->create($item);
            }

            return $order->load('items', 'customer');
        });
    }
}