<?php

namespace App\Console\Commands;

use App\Services\Payments\SepayWebhookService;
use Illuminate\Console\Command;

class RetrySepayWebhookEvents extends Command
{
    protected $signature = 'sepay:retry-events {--limit=100}';

    protected $description = 'Retry durable SePay events that previously failed for a temporary technical reason';

    public function handle(SepayWebhookService $service): int
    {
        $count = $service->retryDue((int) $this->option('limit'));
        $this->info("Đã kiểm tra xử lý lại {$count} event SePay.");

        return self::SUCCESS;
    }
}
