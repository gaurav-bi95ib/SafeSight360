<?php

declare(strict_types=1);

namespace SafeSight360;

use InvalidArgumentException;
use PDO;
use PDOException;

final class AuthService
{
    public function __construct(private PDO $pdo)
    {
    }

    /** @return array{id: int, displayName: string, email: string} */
    public function register(string $displayName, string $email, string $password): array
    {
        $displayName = preg_replace('/\s+/', ' ', trim($displayName)) ?? '';
        $email = strtolower(trim($email));

        if (strlen($displayName) < 2 || strlen($displayName) > 80) {
            throw new InvalidArgumentException('Your name must contain between 2 and 80 characters.');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
            throw new InvalidArgumentException('Enter a valid email address.');
        }
        $this->validatePassword($password);

        $hash = password_hash($password, PASSWORD_DEFAULT);
        if (!is_string($hash)) {
            throw new InvalidArgumentException('The password could not be secured.');
        }

        try {
            $statement = $this->pdo->prepare(
                'INSERT INTO users
                    (display_name, email, password_hash, login_streak, last_activity_date, last_login_at)
                 VALUES (:display_name, :email, :password_hash, 1, CURDATE(), CURRENT_TIMESTAMP)'
            );
            $statement->execute([
                'display_name' => $displayName,
                'email' => $email,
                'password_hash' => $hash,
            ]);
        } catch (PDOException $exception) {
            if ($exception->getCode() === '23000') {
                throw new InvalidArgumentException('An account already exists for that email address.');
            }
            throw $exception;
        }

        return $this->establishSession((int) $this->pdo->lastInsertId(), $displayName, $email);
    }

    /** @return array{id: int, displayName: string, email: string} */
    public function login(string $email, string $password): array
    {
        $email = strtolower(trim($email));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '') {
            throw new InvalidArgumentException('Email or password is incorrect.');
        }

        $statement = $this->pdo->prepare(
            'SELECT id, display_name, email, password_hash FROM users WHERE email = :email LIMIT 1'
        );
        $statement->execute(['email' => $email]);
        $user = $statement->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            throw new InvalidArgumentException('Email or password is incorrect.');
        }

        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            $rehash = password_hash($password, PASSWORD_DEFAULT);
            if (is_string($rehash)) {
                $rehashStatement = $this->pdo->prepare('UPDATE users SET password_hash = :hash WHERE id = :id');
                $rehashStatement->execute(['hash' => $rehash, 'id' => (int) $user['id']]);
            }
        }

        $update = $this->pdo->prepare(
            'UPDATE users
             SET login_streak = CASE
                   WHEN last_activity_date = CURDATE() THEN login_streak
                   WHEN last_activity_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY) THEN login_streak + 1
                   ELSE 1
                 END,
                 last_activity_date = CURDATE(),
                 last_login_at = CURRENT_TIMESTAMP
             WHERE id = :id'
        );
        $update->execute(['id' => (int) $user['id']]);

        return $this->establishSession((int) $user['id'], $user['display_name'], $user['email']);
    }

    public function logout(): void
    {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires' => time() - 42000,
                'path' => $params['path'],
                'domain' => $params['domain'],
                'secure' => $params['secure'],
                'httponly' => $params['httponly'],
                'samesite' => $params['samesite'] ?? 'Strict',
            ]);
        }
        session_destroy();
    }

    /** @return array{id: int, displayName: string, email: string}|null */
    public function currentUser(): ?array
    {
        if (!isset($_SESSION['user_id'], $_SESSION['user_name'], $_SESSION['user_email'])) {
            return null;
        }
        if (!is_numeric($_SESSION['user_id']) || !is_string($_SESSION['user_name']) || !is_string($_SESSION['user_email'])) {
            $_SESSION = [];
            return null;
        }
        return [
            'id' => (int) $_SESSION['user_id'],
            'displayName' => (string) $_SESSION['user_name'],
            'email' => (string) $_SESSION['user_email'],
        ];
    }

    private function validatePassword(string $password): void
    {
        if (strlen($password) < 12 || strlen($password) > 72) {
            throw new InvalidArgumentException('Use a password between 12 and 72 characters.');
        }
        if (preg_match('/[a-z]/', $password) !== 1
            || preg_match('/[A-Z]/', $password) !== 1
            || preg_match('/\d/', $password) !== 1) {
            throw new InvalidArgumentException('Password must include uppercase, lowercase, and a number.');
        }
    }

    /** @return array{id: int, displayName: string, email: string} */
    private function establishSession(int $id, string $displayName, string $email): array
    {
        session_regenerate_id(true);
        $_SESSION['user_id'] = $id;
        $_SESSION['user_name'] = $displayName;
        $_SESSION['user_email'] = $email;
        $_SESSION['auth_started_at'] = time();
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        unset($_SESSION['auth_failures']);

        return ['id' => $id, 'displayName' => $displayName, 'email' => $email];
    }
}
