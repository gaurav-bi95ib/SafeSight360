<?php

declare(strict_types=1);

use SafeSight360\AttemptService;

require_once dirname(__DIR__, 2) . '/src/bootstrap.php';

$action = $_GET['action'] ?? 'training';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    if ($method === 'GET' && $action === 'contract') {
        jsonResponse([
            'apiVersion' => '2026-09-15',
            'moduleTypes' => ['panorama', 'puzzle', 'interactive'],
            'actions' => [
                'session', 'training', 'dashboard', 'leaderboard', 'modules',
                'challenges', 'challenge', 'signup', 'login', 'logout',
                'answer', 'complete', 'create-challenge', 'join-challenge',
            ],
            'challengeCodePattern' => '^[A-F0-9]{8}$',
        ]);
    }

    if ($method === 'GET' && $action === 'session') {
        jsonResponse([
            'authenticated' => authService()->currentUser() !== null,
            'user' => authService()->currentUser(),
            'csrfToken' => $_SESSION['csrf_token'],
        ]);
    }

    if ($method === 'GET' && $action === 'training') {
        requireUserId();
        $slug = $_GET['slug'] ?? 'warehouse-hazard-hunt';
        if (!is_string($slug) || preg_match('/^[a-z0-9-]{3,80}$/', $slug) !== 1) {
            throw new InvalidArgumentException('The requested module is invalid.');
        }
        $bundle = trainingRepository()->getActiveBundle($slug);
        $bundle['csrfToken'] = $_SESSION['csrf_token'];
        jsonResponse($bundle);
    }

    if ($method === 'GET' && $action === 'dashboard') {
        $userId = requireUserId();
        jsonResponse(trainingRepository()->getUserDashboard($userId));
    }

    if ($method === 'GET' && $action === 'leaderboard') {
        $period = $_GET['period'] ?? 'all-time';
        jsonResponse(trainingRepository()->getLeaderboard($period));
    }

    if ($method === 'GET' && $action === 'modules') {
        $userId = requireUserId();
        jsonResponse(trainingRepository()->getUserModuleProgress($userId));
    }

    if ($method === 'GET' && $action === 'challenges') {
        $userId = requireUserId();
        jsonResponse(trainingRepository()->getUserChallenges($userId));
    }

    if ($method === 'GET' && $action === 'challenge') {
        $userId = requireUserId();
        $code = $_GET['code'] ?? '';
        if (!is_string($code)) throw new InvalidArgumentException('Challenge code is required.');
        jsonResponse(trainingRepository()->getChallenge($code, $userId));
    }

    if ($method !== 'POST') {
        jsonResponse(['error' => 'Method not allowed.'], 405);
    }

    requireCsrfToken();
    $payload = readJsonBody();

    if ($action === 'signup') {
        enforceAuthRateLimit();
        $displayName = $payload['displayName'] ?? null;
        $email = $payload['email'] ?? null;
        $password = $payload['password'] ?? null;
        if (!is_string($displayName) || !is_string($email) || !is_string($password)) {
            throw new InvalidArgumentException('Name, email, and password are required.');
        }
        $user = authService()->register($displayName, $email, $password);
        jsonResponse(['user' => $user, 'csrfToken' => $_SESSION['csrf_token']], 201);
    }

    if ($action === 'login') {
        enforceAuthRateLimit();
        $email = $payload['email'] ?? null;
        $password = $payload['password'] ?? null;
        if (!is_string($email) || !is_string($password)) {
            throw new InvalidArgumentException('Email and password are required.');
        }
        try {
            $user = authService()->login($email, $password);
        } catch (InvalidArgumentException $exception) {
            recordAuthFailure();
            throw $exception;
        }
        jsonResponse(['user' => $user, 'csrfToken' => $_SESSION['csrf_token']]);
    }

    if ($action === 'logout') {
        requireUserId();
        authService()->logout();
        jsonResponse(['signedOut' => true]);
    }

    if ($action === 'answer') {
        requireUserId();
        $questionId = $payload['questionId'] ?? null;
        $optionId = $payload['optionId'] ?? null;
        if (!is_int($questionId) || !is_int($optionId)) {
            throw new InvalidArgumentException('questionId and optionId must be integers.');
        }
        jsonResponse(trainingRepository()->validateAnswer($questionId, $optionId));
    }

    if ($action === 'complete') {
        $userId = requireUserId();
        $service = new AttemptService(trainingRepository());
        jsonResponse($service->complete($payload, $userId));
    }

    if ($action === 'create-challenge') {
        $userId = requireUserId();
        $slug = $payload['moduleSlug'] ?? 'warehouse-hazard-hunt';
        $code = trainingRepository()->createChallenge($userId, $slug);
        jsonResponse(['challengeCode' => $code]);
    }

    if ($action === 'join-challenge') {
        $userId = requireUserId();
        $code = $payload['challengeCode'] ?? '';
        if (!is_string($code)) throw new InvalidArgumentException('Challenge code is required.');
        jsonResponse(trainingRepository()->joinChallenge($code, $userId));
    }

    jsonResponse(['error' => 'Unknown API action.'], 404);
} catch (InvalidArgumentException|JsonException $exception) {
    jsonResponse(['error' => $exception->getMessage()], 422);
} catch (Throwable $exception) {
    error_log(sprintf('SafeSight360 API error: %s', $exception->getMessage()));
    $debug = filter_var(getenv('APP_DEBUG') ?: 'false', FILTER_VALIDATE_BOOL);
    jsonResponse([
        'error' => 'The training service is temporarily unavailable.',
        'detail' => $debug ? $exception->getMessage() : null,
    ], 503);
}
