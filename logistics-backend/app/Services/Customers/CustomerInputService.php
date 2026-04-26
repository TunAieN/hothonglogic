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
            'code' => $this->normalizeRequiredString($input['code'] ?? null),
            'name' => $this->normalizeRequiredString($input['name'] ?? null),
            'phone' => $this->normalizePhone($input['phone'] ?? null),
            'email' => $this->normalizeNullableString($input['email'] ?? null, true),
            'address' => $this->normalizeNullableString($input['address'] ?? null),
            'note' => $this->normalizeNullableString($input['note'] ?? null),
        ];
    }

    public function validateForCreate(array $input): array
    {
        $sanitized = $this->sanitize($input);

        Validator::make(
            $sanitized,
            [
                'code' => ['required', 'string', 'max:50', Rule::unique('customers', 'code')],
                'name' => ['required', 'string', 'max:100'],
                'phone' => ['required', 'regex:/^\+?[1-9]\d{7,14}$/'],
                'email' => ['nullable', 'string', 'max:100', 'email:rfc', Rule::unique('customers', 'email')],
                'address' => ['nullable', 'string'],
                'note' => ['nullable', 'string'],
            ],
            [
                'code.required' => 'Customer code is required.',
                'code.unique' => 'Customer code already exists.',
                'name.required' => 'Customer name is required.',
                'phone.required' => 'Phone number is required.',
                'phone.regex' => 'Phone number format is invalid. Use 8 to 15 digits, optionally starting with +.',
                'email.email' => 'Email format is invalid.',
                'email.unique' => 'Email already exists.',
            ]
        )->validate();

        if ($this->phoneExists($sanitized['phone'])) {
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

    private function phoneExists(string $normalizedPhone): bool
    {
        $digitsOnly = ltrim($normalizedPhone, '+');

        return Customer::query()
            ->whereRaw(
                "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '.', ''), '+', '') = ?",
                [$digitsOnly]
            )
            ->exists();
    }
}
