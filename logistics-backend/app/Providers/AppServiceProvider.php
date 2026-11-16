<?php

namespace App\Providers;

use App\Support\DatabaseSafetyGuard;
use Illuminate\Console\Events\CommandStarting;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $connection = (string) config('database.default');
        $database = config("database.connections.{$connection}.database");
        $expectedDatabase = config('database.test_database_name');
        $host = config("database.connections.{$connection}.host");
        $port = config("database.connections.{$connection}.port");
        $expectedHost = config('database.test_database_host');
        $expectedPort = config('database.test_database_port');

        if ($this->app->runningUnitTests()) {
            DatabaseSafetyGuard::assertSafeTestDatabase(
                $connection,
                $database,
                $expectedDatabase,
                $host,
                $port,
                $expectedHost,
                $expectedPort,
            );
        }

        Event::listen(CommandStarting::class, function (CommandStarting $event): void {
            $command = strtok($event->command, ' ') ?: $event->command;
            $connection = (string) config('database.default');
            DatabaseSafetyGuard::assertDestructiveCommandAllowed(
                $command,
                $connection,
                config("database.connections.{$connection}.database"),
                config('database.test_database_name'),
                config("database.connections.{$connection}.host"),
                config("database.connections.{$connection}.port"),
                config('database.test_database_host'),
                config('database.test_database_port'),
            );
        });
    }
}
