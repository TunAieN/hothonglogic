<?php

namespace App\Http\Controllers;

use App\Services\Payments\SepayWebhookAuthenticator;
use App\Services\Payments\SepayWebhookService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SepayWebhookController extends Controller
{
    public function __construct(
        private readonly SepayWebhookService $webhooks,
        private readonly SepayWebhookAuthenticator $authenticator,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        if (! config('sepay.enabled') || ! config('sepay.webhook_enabled')) {
            return response()->json(['success' => false, 'message' => 'SePay webhook disabled.'], 503);
        }
        $secret = (string) config('sepay.webhook_secret');
        if ($secret === '') {
            return response()->json(['success' => false, 'message' => 'Webhook secret is not configured.'], 503);
        }
        $raw = $request->getContent();
        if (strlen($raw) > (int) config('sepay.max_payload_bytes', 65536)) {
            return response()->json(['success' => false, 'message' => 'Payload too large.'], 413);
        }
        if (! str_contains(strtolower((string) $request->header('Content-Type')), 'application/json')) {
            return response()->json(['success' => false, 'message' => 'JSON required.'], 415);
        }

        $timestamp = trim((string) $request->header('X-SePay-Timestamp'));
        $signature = strtolower(trim((string) $request->header('X-SePay-Signature')));
        $verificationError = $this->authenticator->verificationError(
            $raw,
            $timestamp,
            $signature,
            $secret,
            now()->timestamp,
            (int) config('sepay.timestamp_tolerance_seconds', 300),
        );
        if ($verificationError === 'timestamp_invalid') {
            return response()->json(['success' => false, 'message' => 'Invalid or expired timestamp.'], 401);
        }
        if ($verificationError !== null) {
            return response()->json(['success' => false, 'message' => 'Invalid signature.'], 401);
        }

        try {
            $payload = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
            if (! is_array($payload)) {
                throw new \JsonException('Object expected.');
            }
            $event = $this->webhooks->ingest($payload, $raw);

            return response()->json(['success' => true, 'event_status' => $event->status]);
        } catch (\JsonException|\InvalidArgumentException $exception) {
            return response()->json(['success' => false, 'message' => $exception->getMessage()], 422);
        }
    }
}
