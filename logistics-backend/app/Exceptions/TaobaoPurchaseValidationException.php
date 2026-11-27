<?php

namespace App\Exceptions;

use GraphQL\Error\ClientAware;
use GraphQL\Error\ProvidesExtensions;
use RuntimeException;

final class TaobaoPurchaseValidationException extends RuntimeException implements ClientAware, ProvidesExtensions
{
    public function __construct(string $message, private readonly string $errorCode = 'TAOBAO_PURCHASE_INVALID') { parent::__construct($message); }
    public function isClientSafe(): bool { return true; }
    public function getCategory(): string { return 'validation'; }
    public function getExtensions(): array { return ['code' => $this->errorCode]; }
}
