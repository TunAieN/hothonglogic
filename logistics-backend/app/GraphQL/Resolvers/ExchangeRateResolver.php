<?php

namespace App\GraphQL\Resolvers;

use App\Services\Orders\OrderPricingService;

class ExchangeRateResolver
{
    public function __construct(private readonly OrderPricingService $service) {}

    public function list($_, array $args)
    {
        return $this->service->listExchangeRates($args['filter'] ?? []);
    }

    public function active()
    {
        return $this->service->getActiveExchangeRate();
    }

    public function create($_, array $args)
    {
        return $this->service->createExchangeRate($args['input'] ?? []);
    }

    public function activate($_, array $args)
    {
        return $this->service->activateExchangeRate($args['id']);
    }

    public function deactivate($_, array $args)
    {
        return $this->service->deactivateExchangeRate($args['id']);
    }
}
