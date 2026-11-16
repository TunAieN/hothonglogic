<?php

namespace App\Http\Controllers;

use App\Services\Products\ProductMetadataService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class CustomerProductMetadataController extends Controller
{
    public function __invoke(Request $request, ProductMetadataService $service): JsonResponse
    {
        $data = $request->validate(['url' => ['required', 'string', 'max:4000']]);

        return response()->json(['product' => $service->fetch($data['url'])])->header('Cache-Control', 'private, no-store');
    }
}
