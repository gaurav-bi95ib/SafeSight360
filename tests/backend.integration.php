<?php

declare(strict_types=1);

use SafeSight360\AttemptService;
use SafeSight360\Database;
use SafeSight360\TrainingRepository;

require_once dirname(__DIR__) . '/src/Database.php';
require_once dirname(__DIR__) . '/src/AuthService.php';
require_once dirname(__DIR__) . '/src/TrainingRepository.php';
require_once dirname(__DIR__) . '/src/AttemptService.php';

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
    $email = sprintf('integration-%s@example.test', bin2hex(random_bytes(6)));
    $userStatement = $pdo->prepare(
        "INSERT INTO users (display_name, email, password_hash, login_streak, last_activity_date)
         VALUES ('Integration Test', :email, 'not-used', 1, CURDATE())"
    );
    $userStatement->execute(['email' => $email]);
    $userId = (int) $pdo->lastInsertId();

    $repository = new TrainingRepository($pdo);
    $service = new AttemptService($repository);
    $auth = new SafeSight360\AuthService($pdo);

    $authEmail = sprintf('auth-%s@example.test', bin2hex(random_bytes(6)));
    $registered = $auth->register('QA Auth User', $authEmail, 'QaSecure12345');
    expect($registered['email'] === $authEmail, 'Signup did not return the registered user.');
    $currentUser = $auth->currentUser();
    expect($currentUser !== null && $currentUser['email'] === $authEmail, 'Authenticated session was not restored after signup.');
    $auth->logout();
    expect($auth->currentUser() === null, 'Logout did not clear the authenticated session.');
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    $loggedIn = $auth->login($authEmail, 'QaSecure12345');
    expect($loggedIn['email'] === $authEmail, 'Login did not return the authenticated user.');
    $authUserId = (int) $loggedIn['id'];

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

    $challengeCode = $repository->createChallenge($userId, 'warehouse-hazard-hunt');
    $ownChallenge = $repository->getChallenge(' ' . strtolower($challengeCode) . ' ', $userId);
    expect($ownChallenge['code'] === $challengeCode, 'Challenge code normalization failed.');
    $joinedChallenge = $repository->joinChallenge($challengeCode, $authUserId);
    expect($joinedChallenge['status'] === 'accepted', 'Opponent could not join the challenge.');
    $outsiderStatement = $pdo->prepare(
        "INSERT INTO users (display_name, email, password_hash) VALUES ('Outsider', :email, 'not-used')"
    );
    $outsiderStatement->execute(['email' => 'outsider-' . bin2hex(random_bytes(6)) . '@example.test']);
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
