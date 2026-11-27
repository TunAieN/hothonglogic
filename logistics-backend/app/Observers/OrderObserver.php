<?php

namespace App\Observers;

use App\Models\Order;
use App\Services\Customers\CustomerVipService;

class OrderObserver
{
    public function updated(Order $order): void
    {
        if (! $order->wasChanged('status')) {
            return;
        }
        app(CustomerVipService::class)->recordOrderStatusChange($order, $order->getOriginal('status'));
    }
}
