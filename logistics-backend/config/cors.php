<?php

$allowedOrigins = array_values(array_filter(array_map(
    'trim',
    explode(',', env(
        'CORS_ALLOWED_ORIGINS',
        'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174',
    )),
)));

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    'paths' => ['api/*', 'graphql', 'sanctum/csrf-cookie', 'customer-auth/*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => $allowedOrigins,

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,

];
