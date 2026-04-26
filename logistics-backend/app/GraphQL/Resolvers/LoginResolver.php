<?php

namespace App\GraphQL\Resolvers;

use App\Models\User;
use Illuminate\Support\Facades\Hash;

class LoginResolver
{
    public function login($_, array $args)
    {
        $user = User::where('email', $args['email'])->first();

        if (!$user || !Hash::check($args['password'], $user->password)) {
            throw new \Exception('Invalid credentials.');
        }

        // Revoke old tokens (optional – keeps only 1 active session)
        $user->tokens()->delete();

        $token = $user->createToken('api-token')->plainTextToken;
        
        return [
            'access_token' => $token,
            'token_type'   => 'Bearer',
            'user'         => $user,
        ];
    }
}
