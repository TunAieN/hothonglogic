<?php

namespace App\Support;

use Illuminate\Support\Facades\Log;

final class Utf8ValueNormalizer
{
    /** @var array<string, true> */
    private static array $reported = [];

    public static function string(?string $value, string $table, int $recordId, string $field): ?string
    {
        if ($value === null || mb_check_encoding($value, 'UTF-8')) {
            return $value;
        }

        $context = ['table' => $table, 'record_id' => $recordId, 'field' => $field];
        $key = implode(':', $context);
        if (! isset(self::$reported[$key])) {
            Log::warning('Invalid UTF-8 normalized for customer order API.', $context);
            self::$reported[$key] = true;
        }

        return mb_scrub($value, 'UTF-8');
    }

    /** @return list<string> */
    public static function lines(?string $value, string $table, int $recordId, string $field): array
    {
        $normalized = self::string($value, $table, $recordId, $field);

        return preg_split('/\R/u', (string) $normalized) ?: [];
    }
}
