<?php

declare(strict_types=1);

use SafeSight360\AttemptService;
use SafeSight360\AdminService;
use SafeSight360\Database;
use SafeSight360\TrainingRepository;

require_once dirname(__DIR__) . '/src/Database.php';
require_once dirname(__DIR__) . '/src/AuthService.php';
require_once dirname(__DIR__) . '/src/TrainingRepository.php';
require_once dirname(__DIR__) . '/src/AttemptService.php';
require_once dirname(__DIR__) . '/src/AdminService.php';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function expect(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$pdo = Database::connect();
$pdo->beginTransaction();

try {
    $email = sprintf('integration-%s@safesight360.com', bin2hex(random_bytes(6)));
    $userStatement = $pdo->prepare(
        "INSERT INTO users (display_name, email, password_hash, login_streak, last_activity_date)
         VALUES ('Integration Test', :email, 'not-used', 1, CURDATE())"
    );
    $userStatement->execute(['email' => $email]);
    $userId = (int) $pdo->lastInsertId();
    $pdo->prepare(
        "INSERT INTO training_assignments (user_id, training_version_id, status)
         SELECT :user_id, id, 'not_started' FROM training_versions WHERE is_active = TRUE"
    )->execute(['user_id' => $userId]);

    $repository = new TrainingRepository($pdo);
    $service = new AttemptService($repository);
    $auth = new SafeSight360\AuthService($pdo);

    $adminStatement = $pdo->prepare(
        "INSERT INTO users (display_name, email, password_hash, role, account_status)
         VALUES ('QA Administrator', :email, 'not-used', 'admin', 'active')"
    );
    $adminStatement->execute(['email' => 'admin-' . bin2hex(random_bytes(6)) . '@safesight360.com']);
    $adminId = (int) $pdo->lastInsertId();
    $adminService = new AdminService($pdo, $auth);

    $authEmail = sprintf('auth-%s@safesight360.com', bin2hex(random_bytes(6)));
    $request = $auth->requestAccess('QA Auth User', $authEmail, 'QaSecure12345');
    expect($request['email'] === $authEmail && $request['status'] === 'pending', 'Access request was not recorded.');
    expect($auth->currentUser() === null, 'An access request incorrectly created an authenticated session.');
    $personalEmailRejected = false;
    try {
        $auth->requestAccess('Personal Email', 'personal@gmail.com', 'QaSecure12345');
    } catch (InvalidArgumentException) {
        $personalEmailRejected = true;
    }
    expect($personalEmailRejected, 'A non-organisational email was allowed to request access.');

    $rejectedRequest = $auth->requestAccess(
        'Rejected User',
        'rejected-' . bin2hex(random_bytes(6)) . '@safesight360.com',
        'QaSecure12345'
    );
    $adminService->rejectAccessRequest($adminId, (int) $rejectedRequest['id'], 'Test rejection');
    $requests = $adminService->accessRequests();
    expect(count(array_filter($requests, static fn (array $row): bool =>
        $row['id'] === (int) $rejectedRequest['id'] && $row['status'] === 'rejected'
    )) === 1, 'Administrator rejection was not saved.');
    $approved = $adminService->approveAccessRequest($adminId, (int) $request['id']);
    expect($approved['role'] === 'learner', 'Administrator approval did not create a learner.');
    $adminService->assignTraining($adminId, (int) $approved['id'], [
        'warehouse-hazard-hunt', 'manual-handling', 'working-at-height',
        'five-whys', 'unsafe-acts', 'cyber-awareness',
    ]);
    $loggedIn = $auth->login($authEmail, 'QaSecure12345');
    expect($loggedIn['email'] === $authEmail, 'Login did not return the authenticated user.');
    $authUserId = (int) $loggedIn['id'];

    $managedEmail = sprintf('managed-%s@safesight360.com', bin2hex(random_bytes(6)));
    $managed = $adminService->createLearner($adminId, 'Managed Learner', $managedEmail, 'ManagedSecure123');
    $assignmentResult = $adminService->assignTraining($adminId, (int) $managed['id'], ['manual-handling']);
    expect($assignmentResult['assigned'] === 1, 'Administrator could not assign existing training.');
    $adminService->updateLearner($adminId, (int) $managed['id'], 'Managed Learner Updated', $managedEmail, 'active');
    $managedRows = $adminService->learners('Managed Learner Updated');
    expect(count($managedRows) === 1 && $managedRows[0]['assignedCount'] === 1, 'Learner management did not persist changes.');
    $adminService->deactivateLearner($adminId, (int) $managed['id']);
    $inactiveRejected = false;
    try {
        $auth->login($managedEmail, 'ManagedSecure123');
    } catch (InvalidArgumentException) {
        $inactiveRejected = true;
    }
    expect($inactiveRejected, 'An inactive learner was allowed to sign in.');

    foreach (['warehouse-hazard-hunt', 'manual-handling', 'working-at-height', 'five-whys', 'unsafe-acts', 'cyber-awareness'] as $slug) {
        $bundle = $repository->getActiveBundle($slug);
        $scenario = $bundle['scenario'];
        expect(in_array($scenario['moduleType'] ?? '', ['panorama', 'puzzle', 'interactive'], true), "$slug is missing moduleType");
        expect(isset($scenario['durationSeconds'], $scenario['scoringFormulaVersion']), "$slug is missing scoring metadata");
        if (($scenario['moduleType'] ?? '') === 'panorama') {
            expect(($scenario['panoramaUrl'] ?? '') !== '', "$slug is missing panoramaUrl");
            expect(isset($scenario['initialView']['yaw'], $scenario['initialView']['pitch'], $scenario['initialView']['fov']), "$slug is missing initial view");
            expect(($scenario['cameraProfile'] ?? '') !== '', "$slug is missing cameraProfile");
            expect(($scenario['sceneFocus'] ?? '') !== '', "$slug is missing sceneFocus");
        }
    }

    $editable = $adminService->moduleContent('manual-handling');
    foreach ($editable['questions'] as &$editableQuestion) {
        $editableQuestion['correctIndex'] = 0;
        foreach ($editableQuestion['options'] as $optionIndex => $option) {
            if ((int) $option['id'] === (int) $editableQuestion['correctOptionId']) {
                $editableQuestion['correctIndex'] = $optionIndex;
                break;
            }
        }
    }
    unset($editableQuestion);
    $editable['scenario']['title'] .= ' QA';
    $savedContent = $adminService->saveModuleContent($adminId, 'manual-handling', $editable);
    expect(str_ends_with($savedContent['scenario']['title'], ' QA'), 'Administrator module title change was not saved.');
    expect(count($savedContent['hazards']) === 4 && count($savedContent['questions']) === 5, 'Content editor lost hotspot or MCQ data.');
    $publicContent = $repository->getActiveBundle('manual-handling');
    expect(!array_key_exists('correctOptionId', $publicContent['questions'][0]), 'A correct answer leaked into the learner payload.');
    $verifiedAnswer = $repository->validateAnswerForModule(
        'manual-handling',
        (int) $savedContent['questions'][0]['id'],
        (int) $savedContent['questions'][0]['correctOptionId']
    );
    expect($verifiedAnswer['correct'] === true, 'Module-scoped edited MCQ answer was not validated.');

    $repository->markTrainingStarted($userId, 'manual-handling');
    $startedProgress = $repository->getUserModuleProgress($userId);
    expect(($startedProgress['manual-handling']['status'] ?? '') === 'in_progress', 'Starting training did not update assignment progress.');

    $cyber = $service->complete([
        'moduleSlug' => 'cyber-awareness',
        'hazardCodes' => [],
        'wrongClicks' => 0,
        'elapsedSeconds' => 45,
        'quizAnswers' => [],
        'overallPercent' => 250,
        'interactiveEvidence' => [
            'answers' => [
                'fundamentals' => [false, true, false],
                'home-working' => [],
                'social-engineering' => [],
                'mobile' => [],
                'phishing' => ['safe', 'danger', 'danger'],
            ],
        ],
    ], $userId);
    expect($cyber['overallPercent'] === 40, 'The server trusted a client-supplied overall percentage.');
    expect($cyber['quizScore'] === 40 && $cyber['quizTotal'] === 100, 'Cyber knowledge result is incomplete.');

    $fiveWhys = $service->complete([
        'moduleSlug' => 'five-whys',
        'hazardCodes' => [],
        'wrongClicks' => 0,
        'elapsedSeconds' => 30,
        'quizAnswers' => [],
        'interactiveEvidence' => ['answers' => ['a', 'b', 'c', 'a', 'd']],
    ], $userId);
    expect($fiveWhys['overallPercent'] === 100, 'The 5 Whys evidence was not scored correctly.');
    expect($fiveWhys['quizScore'] === 5 && $fiveWhys['quizTotal'] === 5, 'The 5 Whys knowledge result is incomplete.');

    $dashboard = $repository->getUserDashboard($userId);
    expect($dashboard['attemptsCount'] === 2, 'Registered attempts were not persisted.');
    expect(in_array('first_responder', $dashboard['badges'], true), 'Server badge persistence failed.');
    expect(in_array('root_cause', $dashboard['badges'], true), 'Special badge persistence failed.');
    $moduleProgress = $repository->getUserModuleProgress($userId);
    expect(($moduleProgress['cyber-awareness']['status'] ?? '') === 'completed', 'Completion did not update the cyber assignment.');
    expect(($moduleProgress['five-whys']['status'] ?? '') === 'completed', 'Completion did not update the 5 Whys assignment.');
    expect(count($adminService->reports($userId)) === 2, 'Administrator reports did not return verified learner history.');

    $challengeCode = $repository->createChallenge($userId, 'warehouse-hazard-hunt');
    $ownChallenge = $repository->getChallenge(' ' . strtolower($challengeCode) . ' ', $userId);
    expect($ownChallenge['code'] === $challengeCode, 'Challenge code normalization failed.');
    $joinedChallenge = $repository->joinChallenge($challengeCode, $authUserId);
    expect($joinedChallenge['status'] === 'accepted', 'Opponent could not join the challenge.');
    $outsiderStatement = $pdo->prepare(
        "INSERT INTO users (display_name, email, password_hash) VALUES ('Outsider', :email, 'not-used')"
    );
    $outsiderStatement->execute(['email' => 'outsider-' . bin2hex(random_bytes(6)) . '@safesight360.com']);
    $outsiderId = (int) $pdo->lastInsertId();
    $denied = false;
    try {
        $repository->getChallenge($challengeCode, $outsiderId);
    } catch (InvalidArgumentException) {
        $denied = true;
    }
    expect($denied, 'A non-participant could read a private challenge.');

    $warehouse = $repository->getActiveBundle('warehouse-hazard-hunt');
    $hazardCodes = array_column($warehouse['hazards'], 'code');
    $answers = [];
    foreach ($warehouse['questions'] as $question) {
        foreach ($question['options'] as $option) {
            $result = $repository->validateAnswer((int) $question['id'], (int) $option['id']);
            if ($result['correct']) {
                $answers[(int) $question['id']] = (int) $option['id'];
                break;
            }
        }
    }
    $challengerAttempt = $service->complete([
        'moduleSlug' => 'warehouse-hazard-hunt',
        'challengeCode' => $challengeCode,
        'hazardCodes' => $hazardCodes,
        'wrongClicks' => 0,
        'elapsedSeconds' => 90,
        'quizAnswers' => $answers,
    ], $userId);
    expect($challengerAttempt['overallPercent'] === 100, 'Challenge challenger score was not calculated.');
    $opponentAttempt = $service->complete([
        'moduleSlug' => 'warehouse-hazard-hunt',
        'challengeCode' => $challengeCode,
        'hazardCodes' => array_slice($hazardCodes, 0, 7),
        'wrongClicks' => 1,
        'elapsedSeconds' => 110,
        'quizAnswers' => $answers,
    ], $authUserId);
    expect(($opponentAttempt['challenge']['status'] ?? '') === 'completed', '1v1 challenge did not complete after both attempts.');
    expect(($opponentAttempt['challenge']['winner'] ?? '') === 'challenger', '1v1 winner was not resolved correctly.');

    $rejected = false;
    try {
        $service->complete([
            'moduleSlug' => 'cyber-awareness',
            'hazardCodes' => [],
            'wrongClicks' => 0,
            'elapsedSeconds' => 0,
            'quizAnswers' => [],
            'overallPercent' => 250,
        ], $userId);
    } catch (InvalidArgumentException) {
        $rejected = true;
    }
    expect($rejected, 'Missing interactive evidence was accepted.');

    echo "Backend integration checks passed.\n";
    $pdo->rollBack();
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, $exception->getMessage() . PHP_EOL);
    exit(1);
}
