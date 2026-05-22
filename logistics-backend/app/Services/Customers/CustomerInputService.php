<?php

namespace App\Services\Customers;

use App\Models\Customer;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class CustomerInputService
{
    public function sanitize(array $input): array
    {
        return [
            'code' => $this->normalizeNullableString($input['code'] ?? null),
            'name' => $this->normalizeRequiredString($input['name'] ?? null),
            'vip_group' => $this->normalizeNullableString($input['vip_group'] ?? null),
            'phone' => $this->normalizePhone($input['phone'] ?? null),
            'email' => $this->normalizeNullableString($input['email'] ?? null, true),
            'province' => $this->normalizeNullableString($input['province'] ?? null),
            'district' => $this->normalizeNullableString($input['district'] ?? null),
            'ward' => $this->normalizeNullableString($input['ward'] ?? null),
            'address' => $this->normalizeNullableString($input['address'] ?? null),
            'note' => $this->normalizeNullableString($input['note'] ?? null),
            'status' => $this->normalizeNullableString($input['status'] ?? null, true),
        ];
    }

    public function validateForCreate(array $input): array
    {
        $sanitized = $this->sanitize($input);

        Validator::make(
            $sanitized,
            [
                'name' => ['required', 'string', 'max:100'],
                'vip_group' => ['nullable', 'string', 'max:50'],
                'phone' => ['required', Rule::unique('customers', 'phone')],
                'email' => ['nullable', 'email'],
                'province' => ['nullable', 'string', 'max:100'],
                'district' => ['nullable', 'string', 'max:100'],
                'ward' => ['nullable', 'string', 'max:100'],
                'address' => ['nullable', 'string'],
                'note' => ['nullable', 'string'],
            ],
            [
                'name.required' => 'Customer name is required.',
                'phone.required' => 'Phone number is required.',
                'phone.unique' => 'Phone number already exists.',
                'email.email' => 'Email format is invalid.',
            ]
        )->validate();

        return $sanitized;
    }

    public function generateCustomerCode(): string
    {
        $lastCustomer = Customer::query()->latest('id')->first();
        $nextId = $lastCustomer ? $lastCustomer->id + 1 : 1;

        return 'KH' . str_pad((string) $nextId, 6, '0', STR_PAD_LEFT);
    }

    public function validateGeneratedCode(string $code): void
    {
        Validator::make(
            ['code' => $code],
            [
                'code' => ['required', 'string', 'max:50', Rule::unique('customers', 'code')],
            ],
            [
                'code.required' => 'Customer code is required.',
                'code.unique' => 'Customer code already exists.',
            ]
        )->validate();
    }

    public function validateForUpdate(array $input, Customer $customer): array
    {
        $sanitized = $this->sanitize($input);

        Validator::make(
            $sanitized,
            [
                'code' => ['required', 'string', 'max:50', Rule::unique('customers', 'code')->ignore($customer->id)],
                'name' => ['required', 'string', 'max:100'],
                'vip_group' => ['nullable', 'string', 'max:50'],
                'phone' => ['required', 'regex:/^\+?[1-9]\d{7,14}$/'],
                'email' => ['nullable', 'string', 'max:100', 'email:rfc', Rule::unique('customers', 'email')->ignore($customer->id)],
                'province' => ['nullable', 'string', 'max:100'],
                'district' => ['nullable', 'string', 'max:100'],
                'ward' => ['nullable', 'string', 'max:100'],
                'address' => ['nullable', 'string'],
                'note' => ['nullable', 'string'],
                'status' => ['nullable', 'string', Rule::in(['active', 'inactive', 'blocked'])],
            ],
            [
                'code.required' => 'Customer code is required.',
                'code.unique' => 'Customer code already exists.',
                'name.required' => 'Customer name is required.',
                'phone.required' => 'Phone number is required.',
                'phone.regex' => 'Phone number format is invalid. Use 8 to 15 digits, optionally starting with +.',
                'email.email' => 'Email format is invalid.',
                'email.unique' => 'Email already exists.',
                'status.in' => 'Customer status is invalid.',
            ]
        )->validate();

        if ($this->phoneExists($sanitized['phone'], $customer->id)) {
            throw ValidationException::withMessages([
                'phone' => ['Phone number already exists.'],
            ]);
        }

        return $sanitized;
    }

    private function normalizeRequiredString(mixed $value): string
    {
        return trim((string) $value);
    }

    private function normalizeNullableString(mixed $value, bool $lowercase = false): ?string
    {
        if ($value === null) {
            return null;
        }

        $normalized = trim((string) $value);

        if ($normalized === '') {
            return null;
        }

        return $lowercase ? strtolower($normalized) : $normalized;
    }

    private function normalizePhone(mixed $value): string
    {
        $phone = trim((string) $value);
        $digitsOnly = preg_replace('/\D+/', '', $phone) ?? '';
        $hasLeadingPlus = str_starts_with($phone, '+');

        if ($digitsOnly === '') {
            return '';
        }

        return $hasLeadingPlus ? '+' . $digitsOnly : $digitsOnly;
    }

    private function phoneExists(string $normalizedPhone, ?int $ignoreCustomerId = null): bool
    {
        $digitsOnly = ltrim($normalizedPhone, '+');
        $query = Customer::query()->whereRaw(
            "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '.', ''), '+', '') = ?",
            [$digitsOnly]
        );

        if ($ignoreCustomerId !== null) {
            $query->whereKeyNot($ignoreCustomerId);
        }

        return $query->exists();
    }
}
