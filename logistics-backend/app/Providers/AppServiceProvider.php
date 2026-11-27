<?php

namespace App\Providers;

use App\Models\Order;
use App\Observers\OrderObserver;
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
        Order::observe(OrderObserver::class);
        $connection = (string) config('database.default');
        $database = config("database.connections.{$connection}.database");
        $expectedDatabase = config('database.test_database_name');
        $host = config("database.connections.{$connection}.host");
        $port = config("database.connections.{$connection}.port");
        $expectedHost = config('database.test_database_host');
        $expectedPort = config('database.test_database_port');
        $username = config("database.connections.{$connection}.username");
        $expectedUsername = config('database.test_database_username');

        // APP_ENV=testing alone is not proof that a database target is safe. Composer
        // package discovery may legitimately boot Laravel with that environment, but
        // it neither needs nor opens a database connection. The PHPUnit process is the
        // boundary at which every test bootstrap must validate its configured target.
        if ($this->app->runningUnitTests() && defined('PHPUNIT_COMPOSER_INSTALL')) {
            DatabaseSafetyGuard::assertSafeTestDatabase(
                $connection,
                $database,
                $expectedDatabase,
                $host,
                $port,
                $expectedHost,
                $expectedPort,
                $username,
                $expectedUsername,
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
                config("database.connections.{$connection}.username"),
                config('database.test_database_username'),
            );
        });
    }
}
