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

            $total = collect($input['items'])->sum(function ($item) {
                return $item['price_cny'] * $item['quantity'];
            });

            $order = Order::create([
                'order_code' => 'ORD-' . date('Ymd') . '-' . strtoupper(substr(uniqid(), -6)),
                'customer_id' => $input['customer_id'],
                'total_amount' => $total,
                'note' => $input['note'] ?? null,
                'status' => 'pending',
                'created_by' => Auth::id(),
            ]);

            foreach ($input['items'] as $item) {
                $order->items()->create($item);
            }

            return $order->load('items', 'customer', 'creator');
        });
    }
    
    public function update($_, array $args)
    {
        // if (!auth('api')->check()) {
        //     throw new \Exception(
        //         'Unauthenticated. Please login to update an order.'
        //     );
        // }

        return DB::transaction(function () use ($args) {
            $id = $args['id'];
            $input = $args['input'];

            $order = Order::findOrFail($id);
            $nextItems = null;

            if (array_key_exists('items', $input) && is_array($input['items'])) {
                $nextItems = $input['items'];
            }

            $total = $nextItems !== null
                ? collect($nextItems)->sum(function ($item) {
                    return $item['price_cny'] * $item['quantity'];
                })
                : $order->total_amount;

            $order->update([
                'customer_id' => $input['customer_id'] ?? $order->customer_id,
                'status' => $input['status'] ?? $order->status,
                'note' => $input['note'] ?? $order->note,
                'created_by' => $input['account_manager_id'] ?? $order->created_by,
                'total_amount' => $total,
            ]);

            if ($nextItems !== null) {
                $order->items()->delete();

                foreach ($nextItems as $item) {
                    $order->items()->create($item);
                }
            }

            return $order->load('items', 'customer', 'creator');
        });
    }

    public function delete($_, array $args): Order
    {
        return DB::transaction(function () use ($args) {
            $order = Order::query()
                ->with(['items', 'customer', 'creator'])
                ->findOrFail($args['id']);

            $deletedOrder = $order->replicate();
            $deletedOrder->setAttribute('id', $order->id);
            $deletedOrder->setRelation('items', $order->items);
            $deletedOrder->setRelation('customer', $order->customer);
            $deletedOrder->setRelation('creator', $order->creator);

            $order->items()->delete();
            $order->delete();

            return $deletedOrder;
        });
    }
}
