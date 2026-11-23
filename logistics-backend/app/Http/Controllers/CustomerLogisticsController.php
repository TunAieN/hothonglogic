<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Services\Customer\CustomerLogisticsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerLogisticsController extends Controller
{
    public function __construct(private readonly CustomerLogisticsService $logistics) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'tracking_number' => ['nullable', 'string', 'max:150'], 'package_id' => ['nullable', 'integer', 'min:1'],
            'order_code' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', 'in:recorded,cn_received,in_transit,vn_received,delivered'],
            'warehouse' => ['nullable', 'in:cn,transit,vn'],
            'recorded_from' => ['nullable', 'date_format:Y-m-d'], 'recorded_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:recorded_from'],
            'page' => ['nullable', 'integer', 'min:1'], 'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);
        $owned = $this->logistics->ownedPackagesQuery($this->customerId($request));
        $statistics = $this->logistics->statistics(clone $owned);
        $packages = $this->logistics->applyPackageFilters($owned, $filters)->with($this->logistics->packageRelations())
            ->latest('created_at')->latest('id')->paginate((int) ($filters['per_page'] ?? 10));

        return response()->json([
            'packages' => collect($packages->items())->map(fn ($package) => $this->logistics->packagePayload($package)),
            'pagination' => ['current_page' => $packages->currentPage(), 'last_page' => $packages->lastPage(), 'per_page' => $packages->perPage(), 'total' => $packages->total()],
            'statistics' => $statistics,
        ]);
    }

    public function show(Request $request, int $package): JsonResponse
    {
        $owned = $this->logistics->ownedPackagesQuery($this->customerId($request))->with($this->logistics->packageRelations())->findOrFail($package);
        return response()->json(['package' => $this->logistics->packagePayload($owned, true)]);
    }

    public function tracking(Request $request): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'string', 'min:1', 'max:150']]);
        return response()->json(['results' => $this->logistics->trackingResults($this->customerId($request), $data['code'])]);
    }

    public function orderShipments(Request $request, int $order): JsonResponse
    {
        $owned = Order::query()->where('customer_id', $this->customerId($request))->findOrFail($order);
        return response()->json(['results' => $this->logistics->orderTrackingResults($owned)]);
    }

    private function customerId(Request $request): int
    {
        return (int) $request->user('customer')->customer_id;
    }
}
