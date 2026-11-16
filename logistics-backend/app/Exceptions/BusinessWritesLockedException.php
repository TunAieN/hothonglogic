<?php

namespace App\Exceptions;

use GraphQL\Error\ClientAware;
use GraphQL\Error\ProvidesExtensions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

final class BusinessWritesLockedException extends RuntimeException implements ClientAware, ProvidesExtensions
{
    public function __construct(public readonly string $operation)
    {
        parent::__construct('BUSINESS_WRITES_LOCKED: Nghiệp vụ ghi đang bị khóa để bảo vệ dữ liệu.');
    }

    public function isClientSafe(): bool
    {
        return true;
    }

    public function getExtensions(): ?array
    {
        return [
            'code' => 'BUSINESS_WRITES_LOCKED',
            'operation' => $this->operation,
        ];
    }

    public function render(Request $request): JsonResponse
    {
        return response()->json([
            'message' => 'Nghiệp vụ ghi đang bị khóa để bảo vệ dữ liệu.',
            'code' => 'BUSINESS_WRITES_LOCKED',
            'operation' => $this->operation,
        ], 423);
    }
}
