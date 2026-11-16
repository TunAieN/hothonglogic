<?php

namespace App\GraphQL\Resolvers;

use GraphQL\Error\UserError;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\PersonalAccessToken;

class LogoutResolver
{
    public function logout(): bool
    {
        $user = Auth::guard('api')->user();
        $token = $user?->currentAccessToken();

        if (! $user || ! $token instanceof PersonalAccessToken) {
            throw new UserError('Unauthenticated.');
        }

        return (bool) $token->delete();
    }
}
