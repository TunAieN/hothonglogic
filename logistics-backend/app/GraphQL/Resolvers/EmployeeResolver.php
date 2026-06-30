<?php

namespace App\GraphQL\Resolvers;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class EmployeeResolver
{
    public function list($_, array $args): Builder
    {
        $filter = $args['filter'] ?? [];

        return User::query()
            ->select([
                'id',
                'name',
                'email',
                'role_id',
                'phone',
                'address',
                'status',
                'created_at',
                'updated_at',
            ])
            ->with('role')
            ->when($this->filled($filter, 'search'), function (Builder $query) use ($filter) {
                $search = trim((string) $filter['search']);

                $query->where(function (Builder $nestedQuery) use ($search) {
                    $nestedQuery
                        ->where('name', 'like', '%' . $search . '%')
                        ->orWhere('email', 'like', '%' . $search . '%')
                        ->orWhere('phone', 'like', '%' . $search . '%')
                        ->orWhere('address', 'like', '%' . $search . '%');
                });
            })
            ->when($this->filled($filter, 'role_id'), fn (Builder $query) => $query->where(
                'role_id',
                $filter['role_id'],
            ))
            ->when($this->filled($filter, 'status'), fn (Builder $query) => $query->where(
                'status',
                $filter['status'],
            ))
            ->when($this->filled($filter, 'created_from'), fn (Builder $query) => $query->where(
                'created_at',
                '>=',
                $filter['created_from'],
            ))
            ->when($this->filled($filter, 'created_to'), fn (Builder $query) => $query->where(
                'created_at',
                '<=',
                $filter['created_to'],
            ))
            ->latest('created_at')
            ->latest('id');
    }

    public function show($_, array $args): User
    {
        return User::query()
            ->with('role')
            ->findOrFail($args['id']);
    }

    public function create($_, array $args): User
    {
        $validated = Validator::make($args, [
            'name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email', 'max:100', Rule::unique('users', 'email')],
            'password' => ['required', 'string', 'min:6'],
            'role_id' => ['required', Rule::exists('roles', 'id')],
            'phone' => ['nullable', 'string', 'max:20'],
            'address' => ['nullable', 'string'],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
        ])->validate();

        $employee = User::create([
            ...$validated,
            'status' => $validated['status'] ?? 'active',
        ]);

        return $employee->load('role');
    }

    public function update($_, array $args): User
    {
        $employee = User::query()->findOrFail($args['id']);

        $validated = Validator::make($args, [
            'name' => ['required', 'string', 'max:100'],
            'email' => [
                'required',
                'email',
                'max:100',
                Rule::unique('users', 'email')->ignore($employee->id),
            ],
            'password' => ['nullable', 'string', 'min:6'],
            'role_id' => ['required', Rule::exists('roles', 'id')],
            'phone' => ['nullable', 'string', 'max:20'],
            'address' => ['nullable', 'string'],
            'status' => ['required', Rule::in(['active', 'inactive'])],
        ])->validate();

        if (! $this->filled($validated, 'password')) {
            unset($validated['password']);
        }

        $employee->update($validated);

        return $employee->fresh()->load('role');
    }

    public function delete($_, array $args): User
    {
        $employee = User::query()
            ->with('role')
            ->findOrFail($args['id']);

        $employee->update(['status' => 'inactive']);

        return $employee->fresh()->load('role');
    }

    private function filled(array $values, string $key): bool
    {
        if (! array_key_exists($key, $values)) {
            return false;
        }

        $value = $values[$key];

        return $value !== null && trim((string) $value) !== '';
    }
}