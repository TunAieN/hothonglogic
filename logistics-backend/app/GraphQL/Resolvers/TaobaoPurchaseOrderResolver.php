<?php

namespace App\GraphQL\Resolvers;

use App\Services\Orders\TaobaoPurchaseOrderService;
use Illuminate\Support\Facades\Auth;

final class TaobaoPurchaseOrderResolver
{
    public function __construct(private readonly TaobaoPurchaseOrderService $service) {}
    public function progress($_, array $args): array { return $this->service->progress((int) $args['order_id']); }
    public function save($_, array $args): array { return $this->service->save((int) $args['order_id'], $args['input'] ?? [], (int) Auth::id(), false); }
    public function confirm($_, array $args): array { return $this->service->save((int) $args['order_id'], $args['input'] ?? [], (int) Auth::id(), true); }
}
