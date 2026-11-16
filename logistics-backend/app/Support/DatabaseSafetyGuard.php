<?php

namespace App\Support;

use LogicException;

final class DatabaseSafetyGuard
{
    public static function assertSafeTestDatabase(
        string $connection,
        ?string $database,
        ?string $expectedDatabase,
        ?string $host = null,
        string|int|null $port = null,
        ?string $expectedHost = null,
        string|int|null $expectedPort = null,
    ): void {
        if ($connection === 'sqlite' && $database === ':memory:') {
            return;
        }

        $port = $port === null ? null : (string) $port;
        $expectedPort = $expectedPort === null ? null : (string) $expectedPort;

        if ($connection !== 'mysql'
            || ! is_string($expectedDatabase)
            || ! str_ends_with($expectedDatabase, '_test')
            || $database !== $expectedDatabase
            || $host !== '127.0.0.1'
            || $expectedHost !== '127.0.0.1'
            || $host !== $expectedHost
            || $port !== '3311'
            || $expectedPort !== '3311'
            || $port !== $expectedPort) {
            throw new LogicException(sprintf(
                'Unsafe test database target [%s/%s:%s/%s]. Tests require SQLite :memory: or the approved 127.0.0.1:3311 *_test database.',
                $connection,
                $host ?: '<empty>',
                $port ?: '<empty>',
                $database ?: '<empty>',
            ));
        }
    }

    public static function assertDestructiveCommandAllowed(
        string $command,
        string $connection,
        ?string $database,
        ?string $expectedDatabase,
        ?string $host = null,
        string|int|null $port = null,
        ?string $expectedHost = null,
        string|int|null $expectedPort = null,
    ): void {
        if (! in_array($command, ['db:seed', 'db:wipe', 'migrate:fresh', 'migrate:refresh', 'migrate:reset'], true)) {
            return;
        }

        self::assertSafeTestDatabase(
            $connection,
            $database,
            $expectedDatabase,
            $host,
            $port,
            $expectedHost,
            $expectedPort,
        );
    }
}
