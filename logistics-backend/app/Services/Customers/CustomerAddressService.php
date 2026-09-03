<?php

namespace App\Services\Customers;

use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Services\Shipping\GhnService;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class CustomerAddressService
{
    public function __construct(private readonly GhnService $ghnService) {}

    public function list(int $customerId)
    {
        Customer::query()->findOrFail($customerId);

        return CustomerAddress::query()
            ->where('customer_id', $customerId)
            ->orderByDesc('is_default')
            ->orderBy('id')
            ->get();
    }

    public function create(int $customerId, array $input): CustomerAddress
    {
        return DB::transaction(function () use ($customerId, $input) {
            Customer::query()->lockForUpdate()->findOrFail($customerId);
            $values = $this->validatedValues($input);
            if ($values['is_default']) {
                CustomerAddress::query()->where('customer_id', $customerId)->update(['is_default' => false]);
            }

            return CustomerAddress::query()->create(['customer_id' => $customerId, ...$values]);
        });
    }

    public function update(int $customerId, int $addressId, array $input): CustomerAddress
    {
        return DB::transaction(function () use ($customerId, $addressId, $input) {
            Customer::query()->lockForUpdate()->findOrFail($customerId);
            $address = CustomerAddress::query()
                ->where('customer_id', $customerId)
                ->lockForUpdate()
                ->find($addressId);
            if (! $address) {
                throw new HttpException(422, 'Địa chỉ không thuộc khách hàng đã chọn.');
            }

            $values = $this->validatedValues($input);
            if ($values['is_default']) {
                CustomerAddress::query()
                    ->where('customer_id', $customerId)
                    ->where('id', '!=', $address->id)
                    ->update(['is_default' => false]);
            }
            $address->update($values);

            return $address->fresh();
        });
    }

    public function setDefault(int $customerId, int $addressId): CustomerAddress
    {
        return DB::transaction(function () use ($customerId, $addressId) {
            Customer::query()->lockForUpdate()->findOrFail($customerId);
            $address = CustomerAddress::query()
                ->where('customer_id', $customerId)
                ->lockForUpdate()
                ->find($addressId);
            if (! $address) {
                throw new HttpException(422, 'Địa chỉ không thuộc khách hàng đã chọn.');
            }

            CustomerAddress::query()->where('customer_id', $customerId)->update(['is_default' => false]);
            $address->update(['is_default' => true]);

            return $address->fresh();
        });
    }

    public function findOwned(int $customerId, int $addressId): CustomerAddress
    {
        $address = CustomerAddress::query()->where('customer_id', $customerId)->find($addressId);
        if (! $address) {
            throw new HttpException(422, 'Địa chỉ không thuộc khách hàng đã chọn.');
        }

        return $address;
    }

    public function validatedValues(array $input): array
    {
        foreach (['receiver_name', 'receiver_phone', 'province_code', 'province_name', 'district_code', 'district_name', 'ward_code', 'ward_name', 'address_line'] as $field) {
            if (trim((string) ($input[$field] ?? '')) === '') {
                throw new HttpException(422, 'Thông tin địa chỉ giao hàng chưa đầy đủ.');
            }
        }

        $destination = $this->ghnService->validateDestination(
            (int) $input['province_code'],
            (int) $input['district_code'],
            trim((string) $input['ward_code']),
        );
        $addressLine = trim((string) $input['address_line']);

        return [
            'label' => trim((string) ($input['label'] ?? '')) ?: 'Địa chỉ giao hàng',
            'receiver_name' => trim((string) $input['receiver_name']),
            'receiver_phone' => trim((string) $input['receiver_phone']),
            'province_code' => (string) $destination['province']['province_id'],
            'province_name' => $destination['province']['name'],
            'district_code' => (string) $destination['district']['district_id'],
            'district_name' => $destination['district']['name'],
            'ward_code' => $destination['ward']['ward_code'],
            'ward_name' => $destination['ward']['name'],
            'address_line' => $addressLine,
            'full_address' => implode(', ', [$addressLine, $destination['ward']['name'], $destination['district']['name'], $destination['province']['name']]),
            'is_default' => (bool) ($input['is_default'] ?? false),
        ];
    }
}
