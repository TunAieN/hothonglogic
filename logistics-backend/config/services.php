<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'mailgun' => [
        'domain' => env('MAILGUN_DOMAIN'),
        'secret' => env('MAILGUN_SECRET'),
        'endpoint' => env('MAILGUN_ENDPOINT', 'api.mailgun.net'),
        'scheme' => 'https',
    ],

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'ghn' => [
        'mode' => env('GHN_MODE', 'preview'),
        'base_url' => env('GHN_BASE_URL', 'https://online-gateway.ghn.vn/shiip/public-api'),
        'test_base_url' => env('GHN_TEST_BASE_URL', 'https://dev-online-gateway.ghn.vn/shiip/public-api'),
        'token' => env('GHN_TOKEN'),
        'shop_id' => env('GHN_SHOP_ID'),
        'from_district_id' => env('GHN_FROM_DISTRICT_ID'),
        'from_ward_code' => env('GHN_FROM_WARD_CODE'),
        'max_insurance_value' => 5_000_000,
    ],

];
