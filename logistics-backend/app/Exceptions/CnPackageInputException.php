<?php

namespace App\Exceptions;

use GraphQL\Error\ClientAware;
use GraphQL\Error\ProvidesExtensions;
use RuntimeException;

final class CnPackageInputException extends RuntimeException implements ClientAware, ProvidesExtensions
{
    public function __construct(
        string $message,
        public readonly ?string $field = null,
        public readonly string $errorCode = 'CN_PACKAGE_INVALID_INPUT',
        public readonly int $status = 422,
    ) {
        parent::__construct($message);
    }

    public function isClientSafe(): bool
    {
        return true;
    }

    public function getExtensions(): ?array
    {
        return array_filter([
            'code' => $this->errorCode,
            'category' => 'validation',
            'field' => $this->field,
            'status' => $this->status,
        ], static fn (mixed $value): bool => $value !== null);
    }
}
