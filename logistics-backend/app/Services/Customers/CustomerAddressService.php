<?php

namespace App\Services\Customers;

use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Services\Shipping\GhnService;
use App\Support\BusinessWriteGuard;
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
        BusinessWriteGuard::assertEnabled(__METHOD__);

        return DB::transaction(function () use ($customerId, $input) {
            Customer::query()->lockForUpdate()->findOrFail($customerId);
            $values = $this->validatedValues($input);
            if (! CustomerAddress::query()->where('customer_id', $customerId)->exists()) {
                $values['is_default'] = true;
            }
            if ($values['is_default']) {
                CustomerAddress::query()->where('customer_id', $customerId)->update(['is_default' => false]);
            }

            return CustomerAddress::query()->create(['customer_id' => $customerId, ...$values]);
        });
    }

    public function update(int $customerId, int $addressId, array $input): CustomerAddress
    {
        BusinessWriteGuard::assertEnabled(__METHOD__);

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
            if ($address->is_default && ! $values['is_default']) {
                $values['is_default'] = true;
            }
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
        BusinessWriteGuard::assertEnabled(__METHOD__);

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

    public function findOwnedForUpdate(int $customerId, int $addressId): CustomerAddress
    {
        $address = CustomerAddress::query()
            ->where('customer_id', $customerId)
            ->lockForUpdate()
            ->find($addressId);
        if (! $address) {
            throw new HttpException(422, 'Địa chỉ nhận hàng không còn khả dụng. Vui lòng chọn lại.');
        }

        return $address;
    }

    public function delete(int $customerId, int $addressId): void
    {
        BusinessWriteGuard::assertEnabled(__METHOD__);

        DB::transaction(function () use ($customerId, $addressId) {
            Customer::query()->lockForUpdate()->findOrFail($customerId);
            $address = $this->findOwnedForUpdate($customerId, $addressId);
            $wasDefault = (bool) $address->is_default;
            $address->delete();

            if ($wasDefault) {
                $replacement = CustomerAddress::query()
                    ->where('customer_id', $customerId)
                    ->lockForUpdate()
                    ->orderBy('id')
                    ->first();
                $replacement?->update(['is_default' => true]);
            }
        });
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
        $receiverName = trim((string) $input['receiver_name']);
        $receiverPhone = preg_replace('/\s+/', '', trim((string) $input['receiver_phone']));
        if (! preg_match('/^\+?[0-9][0-9.-]{7,19}$/', $receiverPhone)) {
            throw new HttpException(422, 'Số điện thoại người nhận không hợp lệ.');
        }

        return [
            'label' => trim((string) ($input['label'] ?? '')) ?: 'Địa chỉ giao hàng',
            'receiver_name' => $receiverName,
            'receiver_phone' => $receiverPhone,
            'country_code' => 'VN',
            'country_name' => 'Việt Nam',
            'province_code' => (string) $destination['province']['province_id'],
            'province_name' => $destination['province']['name'],
            'district_code' => (string) $destination['district']['district_id'],
            'district_name' => $destination['district']['name'],
            'ward_code' => $destination['ward']['ward_code'],
            'ward_name' => $destination['ward']['name'],
            'address_line' => $addressLine,
            'full_address' => implode(', ', [$addressLine, $destination['ward']['name'], $destination['district']['name'], $destination['province']['name']]),
            'delivery_note' => trim((string) ($input['delivery_note'] ?? '')) ?: null,
            'is_default' => (bool) ($input['is_default'] ?? false),
        ];
    }
}
