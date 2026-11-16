<?php

namespace Tests;

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Foundation\Application;

trait CreatesApplication
{
    /**
     * Creates the application.
     */
    public function createApplication(): Application
    {
        $app = require __DIR__.'/../bootstrap/app.php';

        if (! is_file($app->basePath('.env.testing')) && ! is_file($app->basePath('.env'))) {
            $app->loadEnvironmentFrom('.env.testing.example');
        }

        $app->make(Kernel::class)->bootstrap();

        return $app;
    }
}
