<?php

namespace App\Http\Controllers;

use App\Models\CustomerAddress;
use App\Services\Customers\CustomerAddressService;
use App\Services\Shipping\GhnService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerAddressController extends Controller
{
    public function __construct(
        private readonly CustomerAddressService $addresses,
        private readonly GhnService $ghn,
    ) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['addresses' => $this->addresses->list($this->customerId($request))->map(fn (CustomerAddress $address) => $this->payload($address))]);
    }

    public function store(Request $request): JsonResponse
    {
        $address = $this->addresses->create($this->customerId($request), $this->input($request));

        return response()->json(['address' => $this->payload($address)], 201);
    }

    public function update(Request $request, int $address): JsonResponse
    {
        $updated = $this->addresses->update($this->customerId($request), $address, $this->input($request));

        return response()->json(['address' => $this->payload($updated)]);
    }

    public function destroy(Request $request, int $address): JsonResponse
    {
        $this->addresses->delete($this->customerId($request), $address);

        return response()->json(['message' => 'Đã xóa địa chỉ nhận hàng.']);
    }

    public function setDefault(Request $request, int $address): JsonResponse
    {
        $updated = $this->addresses->setDefault($this->customerId($request), $address);

        return response()->json(['address' => $this->payload($updated)]);
    }

    public function provinces(): JsonResponse
    {
        return response()->json(['provinces' => $this->ghn->provinces()]);
    }

    public function districts(Request $request): JsonResponse
    {
        $data = $request->validate(['province_id' => ['required', 'integer', 'min:1']]);

        return response()->json(['districts' => $this->ghn->districts((int) $data['province_id'])]);
    }

    public function wards(Request $request): JsonResponse
    {
        $data = $request->validate(['district_id' => ['required', 'integer', 'min:1']]);

        return response()->json(['wards' => $this->ghn->wards((int) $data['district_id'])]);
    }

    private function input(Request $request): array
    {
        return $request->validate([
            'label' => ['nullable', 'string', 'max:100'],
            'receiver_name' => ['required', 'string', 'max:150'],
            'receiver_phone' => ['required', 'string', 'max:30'],
            'province_code' => ['required', 'string', 'max:30'],
            'province_name' => ['nullable', 'string', 'max:100'],
            'district_code' => ['required', 'string', 'max:30'],
            'district_name' => ['nullable', 'string', 'max:100'],
            'ward_code' => ['required', 'string', 'max:30'],
            'ward_name' => ['nullable', 'string', 'max:100'],
            'address_line' => ['required', 'string', 'max:255'],
            'delivery_note' => ['nullable', 'string', 'max:500'],
            'is_default' => ['sometimes', 'boolean'],
        ]);
    }

    private function customerId(Request $request): int
    {
        return (int) $request->user('customer')->customer_id;
    }

    private function payload(CustomerAddress $address): array
    {
        return [
            'id' => $address->id,
            'label' => $address->label,
            'receiver_name' => $address->receiver_name,
            'receiver_phone' => $address->receiver_phone,
            'country_code' => $address->country_code,
            'country_name' => $address->country_name,
            'province_code' => $address->province_code,
            'province_name' => $address->province_name,
            'district_code' => $address->district_code,
            'district_name' => $address->district_name,
            'ward_code' => $address->ward_code,
            'ward_name' => $address->ward_name,
            'address_line' => $address->address_line,
            'full_address' => $address->full_address,
            'delivery_note' => $address->delivery_note,
            'is_default' => (bool) $address->is_default,
            'created_at' => $address->created_at?->toISOString(),
            'updated_at' => $address->updated_at?->toISOString(),
        ];
    }
}
