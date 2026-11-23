<?php

return [
    'enabled' => filter_var(env('SEPAY_ENABLED', false), FILTER_VALIDATE_BOOLEAN),
    'webhook_secret' => env('SEPAY_WEBHOOK_SECRET'),
    'timestamp_tolerance_seconds' => (int) env('SEPAY_TIMESTAMP_TOLERANCE_SECONDS', 300),
    'intent_ttl_minutes' => (int) env('SEPAY_INTENT_TTL_MINUTES', 30),
    'max_payload_bytes' => (int) env('SEPAY_MAX_PAYLOAD_BYTES', 65536),
    'qr_base_url' => env('SEPAY_QR_BASE_URL', 'https://vietqr.app/img'),
];
