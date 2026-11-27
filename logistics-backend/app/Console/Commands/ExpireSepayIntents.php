<?php

namespace App\Console\Commands;

use App\Services\Payments\CustomerFinanceService;
use Illuminate\Console\Command;

class ExpireSepayIntents extends Command
{
    protected $signature = 'sepay:expire-intents {--limit=500}';

    protected $description = 'Mark elapsed pending SePay payment intents as expired';

    public function handle(CustomerFinanceService $finance): int
    {
        $count = $finance->expirePendingIntents((int) $this->option('limit'));
        $this->info("Expired {$count} payment intent(s).");

        return self::SUCCESS;
    }
}
