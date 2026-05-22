<?php

namespace App\GraphQL\Resolvers;

use Illuminate\Support\Facades\Auth;

class AuthResolver
{
    public function me()
    {
        return Auth::guard('api')->user();
    }
}
