<?php

namespace App\Http\Middleware;

use App\Support\BusinessWriteGuard;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class RequireBusinessWritesEnabled
{
    public function handle(Request $request, Closure $next): Response
    {
        BusinessWriteGuard::assertEnabled('http.'.$request->method().' '.$request->route()?->uri());

        return $next($request);
    }
}
