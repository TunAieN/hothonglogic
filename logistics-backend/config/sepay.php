<?php

return [
    'enabled' => filter_var(env('SEPAY_ENABLED', false), FILTER_VALIDATE_BOOLEAN),
    'webhook_secret' => env('SEPAY_WEBHOOK_SECRET'),
    'timestamp_tolerance_seconds' => (int) env('SEPAY_TIMESTAMP_TOLERANCE_SECONDS', 300),
    'intent_ttl_minutes' => (int) env('SEPAY_INTENT_TTL_MINUTES', 30),
    'max_payload_bytes' => (int) env('SEPAY_MAX_PAYLOAD_BYTES', 65536),
    'qr_base_url' => env('SEPAY_QR_BASE_URL', 'https://vietqr.app/img'),
    'retry_delay_seconds' => (int) env('SEPAY_RETRY_DELAY_SECONDS', 60),
    'max_auto_attempts' => (int) env('SEPAY_MAX_AUTO_ATTEMPTS', 7),
    'verified_accounts' => (static function (): array {
        $decoded = json_decode((string) env('SEPAY_VERIFIED_ACCOUNTS', '[]'), true);

        return is_array($decoded) ? array_values(array_filter($decoded, 'is_array')) : [];
    })(),
];
