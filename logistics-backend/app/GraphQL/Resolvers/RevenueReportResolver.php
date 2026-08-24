<?php

namespace App\GraphQL\Resolvers;

use App\Models\VnWarehouse;
use App\Services\RevenueReportService;

class RevenueReportResolver
{
    public function __construct(
        private readonly RevenueReportService $service,
    ) {
    }

    public function report($_, array $args): array
    {
        return $this->service->getReport($args['input'] ?? []);
    }

    public function drilldown($_, array $args): array
    {
        return $this->service->drilldown($args['input'] ?? [], (string) ($args['periodKey'] ?? ''));
    }

    public function warehouses()
    {
        return VnWarehouse::query()->orderBy('name')->get();
    }
}
