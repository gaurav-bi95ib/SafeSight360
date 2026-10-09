<?php

declare(strict_types=1);

use SafeSight360\AttemptService;

require_once dirname(__DIR__, 2) . '/src/bootstrap.php';

$action = $_GET['action'] ?? 'training';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    if ($method === 'GET' && $action === 'contract') {
        jsonResponse([
            'apiVersion' => '2026-10-03',
            'moduleTypes' => ['panorama', 'puzzle', 'interactive'],
            'actions' => [
                'session', 'training', 'dashboard', 'leaderboard', 'modules',
                'challenges', 'challenge', 'request-access', 'login', 'logout',
                'answer', 'complete', 'create-challenge', 'join-challenge',
                'start-training', 'admin-dashboard', 'admin-learners',
                'admin-modules', 'admin-reports', 'admin-create-learner',
                'admin-update-learner', 'admin-deactivate-learner', 'admin-assign-training',
                'admin-access-requests', 'admin-review-access',
                'admin-module-content', 'admin-save-module-content', 'admin-upload-panorama',
            ],
            'challengeCodePattern' => '^[A-F0-9]{8}$',
        ]);
    }

    if ($method === 'GET' && $action === 'session') {
        $currentUser = authService()->currentUser();
        jsonResponse([
            'authenticated' => $currentUser !== null,
            'user' => $currentUser,
            'csrfToken' => $_SESSION['csrf_token'],
        ]);
    }

    if ($method === 'GET' && $action === 'training') {
        $user = authService()->currentUser();
        if ($user === null) jsonResponse(['error' => 'Sign in to continue.'], 401);
        $slug = $_GET['slug'] ?? 'warehouse-hazard-hunt';
        if (!is_string($slug) || preg_match('/^[a-z0-9-]{3,80}$/', $slug) !== 1) {
            throw new InvalidArgumentException('The requested module is invalid.');
        }
        if ($user['role'] === 'learner') {
            trainingRepository()->assertTrainingAssigned((int) $user['id'], $slug);
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
        requireUserId();
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

    if ($method === 'GET' && $action === 'admin-dashboard') {
        requireAdmin();
        jsonResponse(adminService()->dashboard());
    }

    if ($method === 'GET' && $action === 'admin-learners') {
        requireAdmin();
        $search = $_GET['search'] ?? '';
        if (!is_string($search)) throw new InvalidArgumentException('Search text is invalid.');
        jsonResponse(adminService()->learners($search));
    }

    if ($method === 'GET' && $action === 'admin-modules') {
        requireAdmin();
        jsonResponse(adminService()->modules());
    }

    if ($method === 'GET' && $action === 'admin-reports') {
        requireAdmin();
        $learnerId = $_GET['learnerId'] ?? null;
        if ($learnerId !== null && (!is_string($learnerId) || preg_match('/^\d+$/', $learnerId) !== 1)) {
            throw new InvalidArgumentException('Learner filter is invalid.');
        }
        jsonResponse(adminService()->reports($learnerId === null ? null : (int) $learnerId));
    }

    if ($method === 'GET' && $action === 'admin-access-requests') {
        requireAdmin();
        jsonResponse(adminService()->accessRequests());
    }

    if ($method === 'GET' && $action === 'admin-module-content') {
        requireAdmin();
        $slug = $_GET['slug'] ?? '';
        if (!is_string($slug)) throw new InvalidArgumentException('Training module is invalid.');
        jsonResponse(adminService()->moduleContent($slug));
    }

    if ($method !== 'POST') {
        jsonResponse(['error' => 'Method not allowed.'], 405);
    }

    requireCsrfToken();

    if ($action === 'admin-upload-panorama') {
        $admin = requireAdmin();
        $file = $_FILES['panorama'] ?? null;
        if (!is_array($file)) throw new InvalidArgumentException('Choose a panorama image to upload.');
        jsonResponse(adminService()->uploadPanorama((int) $admin['id'], $file), 201);
    }

    requireJsonRequest();
    $payload = readJsonBody();

    if ($action === 'request-access') {
        enforceAccessRequestRateLimit();
        $displayName = $payload['displayName'] ?? null;
        $email = $payload['email'] ?? null;
        $password = $payload['password'] ?? null;
        if (!is_string($displayName) || !is_string($email) || !is_string($password)) {
            throw new InvalidArgumentException('Name, email, and password are required.');
        }
        $request = authService()->requestAccess($displayName, $email, $password);
        recordAccessRequest();
        jsonResponse([
            'request' => $request,
            'message' => 'Your request was submitted for administrator approval.',
        ], 202);
    }

    if ($action === 'signup') {
        jsonResponse(['error' => 'Direct account creation is disabled. Submit an access request for administrator approval.'], 410);
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

    if ($action === 'start-training') {
        $userId = requireUserId();
        $slug = $payload['moduleSlug'] ?? null;
        if (!is_string($slug) || preg_match('/^[a-z0-9-]{3,80}$/', $slug) !== 1) {
            throw new InvalidArgumentException('The module identifier is invalid.');
        }
        trainingRepository()->markTrainingStarted($userId, $slug);
        jsonResponse(['started' => true]);
    }

    if ($action === 'answer') {
        $userId = requireUserId();
        $moduleSlug = $payload['moduleSlug'] ?? null;
        $questionId = $payload['questionId'] ?? null;
        $optionId = $payload['optionId'] ?? null;
        if (!is_string($moduleSlug) || !is_int($questionId) || !is_int($optionId)) {
            throw new InvalidArgumentException('Module, question and option are required.');
        }
        trainingRepository()->assertQuestionAssigned($userId, $moduleSlug, $questionId);
        jsonResponse(trainingRepository()->validateAnswerForModule($moduleSlug, $questionId, $optionId));
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

    if ($action === 'admin-create-learner') {
        $admin = requireAdmin();
        $name = $payload['displayName'] ?? null;
        $email = $payload['email'] ?? null;
        $password = $payload['password'] ?? null;
        if (!is_string($name) || !is_string($email) || !is_string($password)) {
            throw new InvalidArgumentException('Name, email, and password are required.');
        }
        jsonResponse(adminService()->createLearner((int) $admin['id'], $name, $email, $password), 201);
    }

    if ($action === 'admin-update-learner') {
        $admin = requireAdmin();
        $learnerId = $payload['learnerId'] ?? null;
        $name = $payload['displayName'] ?? null;
        $email = $payload['email'] ?? null;
        $status = $payload['status'] ?? null;
        $password = $payload['password'] ?? null;
        if (!is_int($learnerId) || !is_string($name) || !is_string($email) || !is_string($status)
            || ($password !== null && !is_string($password))) {
            throw new InvalidArgumentException('Learner details are invalid.');
        }
        jsonResponse(adminService()->updateLearner(
            (int) $admin['id'], $learnerId, $name, $email, $status, $password
        ));
    }

    if ($action === 'admin-deactivate-learner') {
        $admin = requireAdmin();
        $learnerId = $payload['learnerId'] ?? null;
        if (!is_int($learnerId)) throw new InvalidArgumentException('Learner is invalid.');
        adminService()->deactivateLearner((int) $admin['id'], $learnerId);
        jsonResponse(['deactivated' => true]);
    }

    if ($action === 'admin-assign-training') {
        $admin = requireAdmin();
        $learnerId = $payload['learnerId'] ?? null;
        $modules = $payload['moduleSlugs'] ?? null;
        if (!is_int($learnerId) || !is_array($modules)) {
            throw new InvalidArgumentException('Learner and module selection are required.');
        }
        jsonResponse(adminService()->assignTraining((int) $admin['id'], $learnerId, $modules));
    }

    if ($action === 'admin-review-access') {
        $admin = requireAdmin();
        $requestId = $payload['requestId'] ?? null;
        $decision = $payload['decision'] ?? null;
        $note = $payload['note'] ?? '';
        if (!is_int($requestId) || !is_string($decision) || !is_string($note)) {
            throw new InvalidArgumentException('Access review details are invalid.');
        }
        if ($decision === 'approve') {
            jsonResponse(['learner' => adminService()->approveAccessRequest((int) $admin['id'], $requestId)]);
        }
        if ($decision === 'reject') {
            adminService()->rejectAccessRequest((int) $admin['id'], $requestId, $note);
            jsonResponse(['rejected' => true]);
        }
        throw new InvalidArgumentException('Choose approve or reject.');
    }

    if ($action === 'admin-save-module-content') {
        $admin = requireAdmin();
        $slug = $payload['slug'] ?? null;
        $content = $payload['content'] ?? null;
        if (!is_string($slug) || !is_array($content)) {
            throw new InvalidArgumentException('Module content is invalid.');
        }
        jsonResponse(adminService()->saveModuleContent((int) $admin['id'], $slug, $content));
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
