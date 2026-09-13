<?php

declare(strict_types=1);

use SafeSight360\Database;
use SafeSight360\AuthService;
use SafeSight360\TrainingRepository;

require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/AuthService.php';
require_once __DIR__ . '/TrainingRepository.php';
require_once __DIR__ . '/AttemptService.php';

$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

session_name('safesight360_session');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $isHttps,
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();

if (!isset($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

/** @return array<string, mixed> */
function readJsonBody(): array
{
    $contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength > 50_000) {
        throw new InvalidArgumentException('The request body is too large.');
    }
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    if (strlen($raw) > 50_000) {
        throw new InvalidArgumentException('The request body is too large.');
    }
    $decoded = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($decoded)) {
        throw new InvalidArgumentException('The request body must be a JSON object.');
    }
    return $decoded;
}

function requireCsrfToken(): void
{
    $received = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $expected = $_SESSION['csrf_token'] ?? '';
    if (!is_string($received) || !is_string($expected) || !hash_equals($expected, $received)) {
        jsonResponse(['error' => 'The security token is invalid. Refresh the page and try again.'], 403);
    }
}

/** @param array<string, mixed> $payload */
function jsonResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    echo json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    exit;
}

function trainingRepository(): TrainingRepository
{
    static $repository = null;
    if (!$repository instanceof TrainingRepository) {
        $repository = new TrainingRepository(Database::connect());
    }
    return $repository;
}

function authService(): AuthService
{
    static $service = null;
    if (!$service instanceof AuthService) {
        $service = new AuthService(Database::connect());
    }
    return $service;
}

function requireUserId(): int
{
    $user = authService()->currentUser();
    if ($user === null) {
        jsonResponse(['error' => 'Sign in to continue.'], 401);
    }
    return (int) $user['id'];
}

function enforceAuthRateLimit(): void
{
    $now = time();
    $failures = array_values(array_filter(
        $_SESSION['auth_failures'] ?? [],
        static fn ($timestamp): bool => is_int($timestamp) && $timestamp > $now - 60
    ));
    $_SESSION['auth_failures'] = $failures;
    if (count($failures) >= 5) {
        jsonResponse(['error' => 'Too many sign-in attempts. Wait one minute and try again.'], 429);
    }
}

function recordAuthFailure(): void
{
    $_SESSION['auth_failures'] = $_SESSION['auth_failures'] ?? [];
    $_SESSION['auth_failures'][] = time();
}
