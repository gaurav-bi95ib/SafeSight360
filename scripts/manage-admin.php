<?php

declare(strict_types=1);

use SafeSight360\Database;
use SafeSight360\AuthService;

require_once dirname(__DIR__) . '/src/Database.php';
require_once dirname(__DIR__) . '/src/AuthService.php';

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This command can only run from the command line.\n");
    exit(1);
}

$email = trim($argv[1] ?? '');
$displayName = trim($argv[2] ?? 'SafeSight360 Administrator');
try {
    $email = AuthService::normaliseOrganisationEmail($email);
} catch (InvalidArgumentException $exception) {
    fwrite(STDERR, $exception->getMessage() . "\n");
    fwrite(STDERR, "Usage: php scripts/manage-admin.php admin@safesight360.com [\"Display Name\"]\n");
    exit(1);
}

$pdo = Database::connect();
$find = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
$find->execute(['email' => $email]);
$existingId = $find->fetchColumn();

if ($existingId !== false) {
    $statement = $pdo->prepare(
        "UPDATE users SET role = 'admin', account_status = 'active', deactivated_at = NULL WHERE id = :id"
    );
    $statement->execute(['id' => (int) $existingId]);
    $pdo->prepare('DELETE FROM training_assignments WHERE user_id = :id')
        ->execute(['id' => (int) $existingId]);
    fwrite(STDOUT, "Existing account promoted to administrator: $email\n");
    exit(0);
}

$password = getenv('SAFESIGHT_ADMIN_PASSWORD');
if (!is_string($password) || strlen($password) < 12 || strlen($password) > 72
    || preg_match('/[a-z]/', $password) !== 1
    || preg_match('/[A-Z]/', $password) !== 1
    || preg_match('/\d/', $password) !== 1) {
    fwrite(STDERR, "For a new administrator, set SAFESIGHT_ADMIN_PASSWORD to a 12-72 character password containing uppercase, lowercase, and a number.\n");
    exit(1);
}

$hash = password_hash($password, PASSWORD_DEFAULT);
if (!is_string($hash)) {
    fwrite(STDERR, "The administrator password could not be secured.\n");
    exit(1);
}

$statement = $pdo->prepare(
    "INSERT INTO users (display_name, email, password_hash, role, account_status)
     VALUES (:display_name, :email, :password_hash, 'admin', 'active')"
);
$statement->execute([
    'display_name' => $displayName,
    'email' => $email,
    'password_hash' => $hash,
]);
fwrite(STDOUT, "Administrator created: $email\n");
