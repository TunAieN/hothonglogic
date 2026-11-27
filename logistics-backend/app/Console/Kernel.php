<?php

namespace App\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    /**
     * Define the application's command schedule.
     */
    protected function schedule(Schedule $schedule): void
    {
        if (config('sepay.enabled') && config('business.writes_enabled') && config('business.financial_writes_enabled')) {
            $schedule->command('sepay:expire-intents --limit=500')->everyMinute()->withoutOverlapping();
            if (config('sepay.webhook_enabled')) {
                $schedule->command('sepay:retry-events --limit=100')->everyMinute()->withoutOverlapping();
            }
        }
    }

    /**
     * Register the commands for the application.
     */
    protected function commands(): void
    {
        $this->load(__DIR__.'/Commands');

        require base_path('routes/console.php');
    }
}
