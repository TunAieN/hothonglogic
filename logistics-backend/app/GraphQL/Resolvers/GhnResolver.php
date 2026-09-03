<?php

namespace App\GraphQL\Resolvers;

use App\Services\Shipping\GhnService;

class GhnResolver
{
    public function __construct(private readonly GhnService $service) {}

    public function provinces(): array
    {
        return $this->service->provinces();
    }

    public function districts($_, array $args): array
    {
        return $this->service->districts((int) $args['province_id']);
    }

    public function wards($_, array $args): array
    {
        return $this->service->wards((int) $args['district_id']);
    }

    public function quote($_, array $args): array
    {
        return $this->service->quote($args['input'] ?? []);
    }
}
