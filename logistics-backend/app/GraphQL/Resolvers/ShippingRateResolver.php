<?php

namespace App\GraphQL\Resolvers;

use App\Services\ShippingRateService;

class ShippingRateResolver
{
    public function __construct(
        private readonly ShippingRateService $service,
    ) {
    }

    public function list($_, array $args)
    {
        return $this->service->list($args['filter'] ?? []);
    }

    public function show($_, array $args)
    {
        return $this->service->show($args['id']);
    }

    public function active($_, array $args)
    {
        return $this->service->findActiveRate($args['input'] ?? []);
    }

    public function calculate($_, array $args): array
    {
        return $this->service->calculateFee((float) ($args['input']['weight'] ?? 0), $args['input'] ?? []);
    }

    public function create($_, array $args)
    {
        return $this->service->create($args['input'] ?? []);
    }

    public function update($_, array $args)
    {
        return $this->service->update($args['id'], $args['input'] ?? []);
    }

    public function deactivate($_, array $args)
    {
        return $this->service->deactivate($args['id']);
    }

    public function createDetail($_, array $args)
    {
        return $this->service->createDetail($args['shipping_rate_id'], $args['input'] ?? []);
    }

    public function updateDetail($_, array $args)
    {
        return $this->service->updateDetail($args['id'], $args['input'] ?? []);
    }

    public function deleteDetail($_, array $args): bool
    {
        return $this->service->deleteDetail($args['id']);
    }
}
