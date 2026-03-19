<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class CustomerController extends Controller
{
    /**
     * Display a listing of customers.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Customer::query();

        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->status);
        } else {
            $query->active(); // Default to active customers
        }

        // Search by name, code, or phone
        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('code', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        // Order by
        $orderBy = $request->get('order_by', 'created_at');
        $orderDir = $request->get('order_dir', 'desc');
        $query->orderBy($orderBy, $orderDir);

        // Pagination or all
        if ($request->has('per_page')) {
            $customers = $query->paginate($request->per_page);
        } else {
            $customers = $query->get();
        }

        return response()->json([
            'success' => true,
            'data' => $customers
        ]);
    }

    /**
     * Store a newly created customer.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => 'required|string|max:50|unique:customers,code',
            'name' => 'required|string|max:100',
            'phone' => 'required|string|max:20',
            'email' => 'nullable|email|max:100',
            'address' => 'nullable|string',
            'note' => 'nullable|string',
            'status' => 'in:active,inactive'
        ]);

        $customer = Customer::create($validated);

        return response()->json([
            'success' => true,
            'message' => 'Tạo khách hàng thành công',
            'data' => $customer
        ], 201);
    }

    /**
     * Display the specified customer.
     */
    public function show(Customer $customer): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $customer
        ]);
    }

    /**
     * Update the specified customer.
     */
    public function update(Request $request, Customer $customer): JsonResponse
    {
        $validated = $request->validate([
            'code' => 'sometimes|string|max:50|unique:customers,code,' . $customer->id,
            'name' => 'sometimes|string|max:100',
            'phone' => 'sometimes|string|max:20',
            'email' => 'nullable|email|max:100',
            'address' => 'nullable|string',
            'note' => 'nullable|string',
            'status' => 'in:active,inactive'
        ]);

        $customer->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Cập nhật khách hàng thành công',
            'data' => $customer
        ]);
    }

    /**
     * Remove the specified customer.
     */
    public function destroy(Customer $customer): JsonResponse
    {
        // Check if customer has orders
        if ($customer->orders()->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'Không thể xóa khách hàng đã có đơn hàng'
            ], 400);
        }

        $customer->delete();

        return response()->json([
            'success' => true,
            'message' => 'Xóa khách hàng thành công'
        ]);
    }
}
