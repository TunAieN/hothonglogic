<?php

namespace App\GraphQL\Resolvers;

use App\Models\User;
use GraphQL\Error\UserError;
use Illuminate\Support\Facades\Hash;

class LoginResolver
{
    public function login($_, array $args)
    {
        $user = User::where('email', $args['email'])->first();

        if (! $user || ! Hash::check($args['password'], $user->password)) {
            throw new UserError('Invalid credentials.');
        }

        if ($user->status === 'locked') {
            throw new UserError('Tài khoản của bạn đang tạm khóa.');
        }

        if ($user->status === 'inactive') {
            throw new UserError('Tài khoản này đã ngừng hoạt động.');
        }

        if ($user->status !== 'active') {
            throw new UserError('Tài khoản không ở trạng thái hoạt động.');
        }

        $token = $user->createToken('api-token')->plainTextToken;

        return [
            'access_token' => $token,
            'token_type' => 'Bearer',
            'user' => $user,
        ];
    }
}
