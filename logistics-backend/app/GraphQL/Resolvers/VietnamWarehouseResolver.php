<?php

namespace App\GraphQL\Resolvers;

use App\Services\VietnamWarehouseReceiptService;
use Illuminate\Support\Facades\DB;

class VietnamWarehouseResolver
{
    public function __construct(
        private readonly VietnamWarehouseReceiptService $service,
    ) {
    }

    public function cnBatchByCode($_, array $args)
    {
        return $this->service->findBatchByCode($args['batch_code']);
    }

    public function vietnamWarehouseReceipt($_, array $args): array
    {
        $batch = $this->service->findBatchByCode($args['batch_code']);
        $receipt = $batch->vnBatchReceipt;

        return $this->service->buildReceiptPayload($batch, $receipt);
    }

    public function startVietnamWarehouseReceipt($_, array $args)
    {
        return DB::transaction(fn () => $this->service->startReceipt($args['input'] ?? []));
    }

    public function scanVietnamPackage($_, array $args): array
    {
        return DB::transaction(fn () => $this->service->scanPackage($args['input'] ?? []));
    }

    public function removeVietnamPackage($_, array $args): array
    {
        return DB::transaction(fn () => $this->service->removePackage($args['id']));
    }

    public function confirmVietnamWarehouseReceipt($_, array $args)
    {
        return DB::transaction(fn () => $this->service->confirmReceipt($args['receipt_id']));
    }

    public function moveVietnamWarehouseReceiptToErrorQueue($_, array $args)
    {
        return DB::transaction(fn () => $this->service->moveReceiptToErrorQueue($args['receipt_id']));
    }
}
