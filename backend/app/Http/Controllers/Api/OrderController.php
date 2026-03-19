<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Carbon\Carbon;

class OrderController extends Controller
{
    /**
     * Store a newly created order.
     */
    public function store(Request $request)
    {
        $request->validate([
            'customer_id' => 'required|exists:customers,id',
            'items' => 'required|array|min:1',
            'items.*.product_name' => 'required|string',
            'items.*.price_cny' => 'required|numeric|min:0',
            'items.*.quantity' => 'required|integer|min:1',
        ]);

        try {
            DB::beginTransaction();

            // 1. Generate Order Code
            $date = Carbon::now()->format('Ymd');
            $count = Order::whereDate('created_at', Carbon::today())->count() + 1;
            $sequence = str_pad($count, 4, '0', STR_PAD_LEFT);
            $orderCode = "ORD-{$date}-{$sequence}";

            // 2. Calculate Total
            $totalAmount = 0;
            foreach ($request->items as $item) {
                $totalAmount += ($item['price_cny'] * $item['quantity']);
            }

            // 3. Create Order
            // Hardcode created_by to 1 (Admin) until auth is implemented for extension
            $order = Order::create([
                'order_code' => $orderCode,
                'customer_id' => $request->customer_id,
                'status' => 'pending',
                'total_amount' => $totalAmount,
                'note' => $request->note,
                'created_by' => 1, 
            ]);

            // 4. Create Items
            foreach ($request->items as $item) {
                OrderItem::create([
                    'order_id' => $order->id,
                    'product_name' => $item['product_name'],
                    'product_link' => $item['product_link'] ?? null,
                    'price_cny' => $item['price_cny'],
                    'quantity' => $item['quantity'],
                    'note' => $item['note'] ?? null,
                    'product_image' => $item['product_image'] ?? null,
                ]);
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Order created successfully',
                'data' => $order->load('items')
            ], 201);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to create order: ' . $e->getMessage()
            ], 500);
        }
    }

    public function index()
    {
        return response()->json([
            'success' => true,
            'data' => Order::with(['customer', 'items'])->latest()->paginate(20)
        ]);
    }
}
