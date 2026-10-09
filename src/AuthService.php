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

    /** @return array{id: int, email: string, status: string} */
    public function requestAccess(string $displayName, string $email, string $password): array
    {
        $displayName = preg_replace('/\s+/', ' ', trim($displayName)) ?? '';
        $email = self::normaliseOrganisationEmail($email);
        if (strlen($displayName) < 2 || strlen($displayName) > 80) {
            throw new InvalidArgumentException('Your name must contain between 2 and 80 characters.');
        }
        $this->validatePassword($password);

        $account = $this->pdo->prepare('SELECT 1 FROM users WHERE email = :email LIMIT 1');
        $account->execute(['email' => $email]);
        if ($account->fetchColumn()) {
            throw new InvalidArgumentException('An account already exists for this organisational email. Sign in instead.');
        }

        $hash = password_hash($password, PASSWORD_DEFAULT);
        if (!is_string($hash)) {
            throw new InvalidArgumentException('The password could not be secured.');
        }

        $existing = $this->pdo->prepare('SELECT id, status FROM access_requests WHERE email = :email LIMIT 1');
        $existing->execute(['email' => $email]);
        $request = $existing->fetch();
        if ($request && $request['status'] === 'pending') {
            throw new InvalidArgumentException('An access request for this email is already awaiting administrator review.');
        }
        if ($request && $request['status'] === 'approved') {
            throw new InvalidArgumentException('This access request has already been approved. Sign in or contact an administrator.');
        }

        if ($request) {
            $statement = $this->pdo->prepare(
                "UPDATE access_requests
                 SET display_name = :display_name, password_hash = :password_hash, status = 'pending',
                     review_note = NULL, reviewed_by = NULL, reviewed_at = NULL, created_at = CURRENT_TIMESTAMP
                 WHERE id = :id"
            );
            $statement->execute([
                'display_name' => $displayName,
                'password_hash' => $hash,
                'id' => (int) $request['id'],
            ]);
            $requestId = (int) $request['id'];
        } else {
            $statement = $this->pdo->prepare(
                "INSERT INTO access_requests (display_name, email, password_hash, status)
                 VALUES (:display_name, :email, :password_hash, 'pending')"
            );
            $statement->execute([
                'display_name' => $displayName,
                'email' => $email,
                'password_hash' => $hash,
            ]);
            $requestId = (int) $this->pdo->lastInsertId();
        }

        return ['id' => $requestId, 'email' => $email, 'status' => 'pending'];
    }

    /** @return array{id: int, displayName: string, email: string, role: string, status: string} */
    public function createLearner(string $displayName, string $email, string $password, bool $assignAll = false): array
    {
        $displayName = preg_replace('/\s+/', ' ', trim($displayName)) ?? '';
        $email = self::normaliseOrganisationEmail($email);

        if (strlen($displayName) < 2 || strlen($displayName) > 80) {
            throw new InvalidArgumentException('Your name must contain between 2 and 80 characters.');
        }
        $this->validatePassword($password);

        $hash = password_hash($password, PASSWORD_DEFAULT);
        if (!is_string($hash)) {
            throw new InvalidArgumentException('The password could not be secured.');
        }

        try {
            $statement = $this->pdo->prepare(
                'INSERT INTO users
                    (display_name, email, password_hash, role, account_status)
                 VALUES (:display_name, :email, :password_hash, "learner", "active")'
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

        $userId = (int) $this->pdo->lastInsertId();
        if ($assignAll) {
            $this->assignAllActiveModules($userId);
        }

        return [
            'id' => $userId,
            'displayName' => $displayName,
            'email' => $email,
            'role' => 'learner',
            'status' => 'active',
        ];
    }

    /** @return array{id: int, displayName: string, email: string, role: string, status: string} */
    public function login(string $email, string $password): array
    {
        try {
            $email = self::normaliseOrganisationEmail($email);
        } catch (InvalidArgumentException) {
            throw new InvalidArgumentException('Email or password is incorrect.');
        }
        if ($password === '') {
            throw new InvalidArgumentException('Email or password is incorrect.');
        }

        $statement = $this->pdo->prepare(
            'SELECT id, display_name, email, password_hash, role, account_status
             FROM users WHERE email = :email LIMIT 1'
        );
        $statement->execute(['email' => $email]);
        $user = $statement->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            throw new InvalidArgumentException('Email or password is incorrect.');
        }
        if ($user['account_status'] !== 'active') {
            throw new InvalidArgumentException('This account is inactive. Contact an administrator.');
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

        return $this->establishSession(
            (int) $user['id'],
            $user['display_name'],
            $user['email'],
            $user['role'],
            $user['account_status']
        );
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

    /** @return array{id: int, displayName: string, email: string, role: string, status: string}|null */
    public function currentUser(): ?array
    {
        if (!isset(
            $_SESSION['user_id'],
            $_SESSION['user_name'],
            $_SESSION['user_email'],
            $_SESSION['user_role'],
            $_SESSION['auth_started_at'],
            $_SESSION['auth_last_seen'],
            $_SESSION['auth_fingerprint']
        )) {
            return null;
        }
        if (!is_numeric($_SESSION['user_id'])
            || !is_string($_SESSION['user_name'])
            || !is_string($_SESSION['user_email'])
            || !is_string($_SESSION['user_role'])) {
            $this->clearAuthenticatedState();
            return null;
        }

        $now = time();
        $idleExpired = $now - (int) $_SESSION['auth_last_seen'] > 1800;
        $absoluteExpired = $now - (int) $_SESSION['auth_started_at'] > 28800;
        $fingerprintChanged = !hash_equals(
            (string) $_SESSION['auth_fingerprint'],
            $this->sessionFingerprint()
        );
        if ($idleExpired || $absoluteExpired || $fingerprintChanged) {
            $this->clearAuthenticatedState();
            return null;
        }

        $statement = $this->pdo->prepare(
            'SELECT display_name, email, role, account_status FROM users WHERE id = :id LIMIT 1'
        );
        $statement->execute(['id' => (int) $_SESSION['user_id']]);
        $user = $statement->fetch();
        if (!$user || $user['account_status'] !== 'active') {
            $this->clearAuthenticatedState();
            return null;
        }

        $_SESSION['auth_last_seen'] = $now;
        $_SESSION['user_name'] = $user['display_name'];
        $_SESSION['user_email'] = $user['email'];
        $_SESSION['user_role'] = $user['role'];
        return [
            'id' => (int) $_SESSION['user_id'],
            'displayName' => $user['display_name'],
            'email' => $user['email'],
            'role' => $user['role'],
            'status' => $user['account_status'],
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

    public static function normaliseOrganisationEmail(string $email): string
    {
        $email = strtolower(trim($email));
        if (strlen($email) > 190
            || filter_var($email, FILTER_VALIDATE_EMAIL) === false
            || preg_match('/^[a-z0-9.!#$%&\'*+\/=?^_`{|}~-]+@safesight360\.com$/i', $email) !== 1) {
            throw new InvalidArgumentException('Use your SafeSight360 email, for example amit@safesight360.com.');
        }
        return $email;
    }

    /** @return array{id: int, displayName: string, email: string, role: string, status: string} */
    private function establishSession(
        int $id,
        string $displayName,
        string $email,
        string $role,
        string $status
    ): array
    {
        session_regenerate_id(true);
        $_SESSION['user_id'] = $id;
        $_SESSION['user_name'] = $displayName;
        $_SESSION['user_email'] = $email;
        $_SESSION['user_role'] = $role;
        $_SESSION['auth_started_at'] = time();
        $_SESSION['auth_last_seen'] = time();
        $_SESSION['auth_fingerprint'] = $this->sessionFingerprint();
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        unset($_SESSION['auth_failures']);

        return [
            'id' => $id,
            'displayName' => $displayName,
            'email' => $email,
            'role' => $role,
            'status' => $status,
        ];
    }

    private function assignAllActiveModules(int $userId): void
    {
        $statement = $this->pdo->prepare(
            'INSERT IGNORE INTO training_assignments (user_id, training_version_id, status)
             SELECT :user_id, id, "not_started"
             FROM training_versions WHERE is_active = TRUE'
        );
        $statement->execute(['user_id' => $userId]);
    }

    private function sessionFingerprint(): string
    {
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
        return hash('sha256', is_string($userAgent) ? $userAgent : '');
    }

    private function clearAuthenticatedState(): void
    {
        foreach ([
            'user_id', 'user_name', 'user_email', 'user_role',
            'auth_started_at', 'auth_last_seen', 'auth_fingerprint',
        ] as $key) {
            unset($_SESSION[$key]);
        }
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
}
