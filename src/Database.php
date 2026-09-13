<?php

declare(strict_types=1);

namespace SafeSight360;

use PDO;
use PDOException;
use RuntimeException;

final class Database
{
    public static function connect(): PDO
    {
        $host = self::env('DB_HOST', '127.0.0.1');
        $port = self::env('DB_PORT', '3306');
        $name = self::env('DB_NAME', 'safesight360');
        $user = self::env('DB_USER', 'root');
        $password = self::env('DB_PASSWORD', '');
        $environment = strtolower(self::env('APP_ENV', 'development'));

        if ($password === '' && $environment !== 'development' && $host !== '127.0.0.1' && $host !== 'localhost') {
            throw new RuntimeException('Database credentials are not configured. Empty passwords are allowed only in development.');
        }

        $dsn = sprintf(
            'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
            $host,
            $port,
            $name
        );

        try {
            return new PDO($dsn, $user, $password, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_STRINGIFY_FETCHES => false,
            ]);
        } catch (PDOException $exception) {
            throw new RuntimeException('Database connection failed.', 0, $exception);
        }
    }

    private static function env(string $key, string $default): string
    {
        $value = getenv($key);
        return $value === false || trim($value) === '' ? $default : trim($value);
    }
}
