<?php

declare(strict_types=1);

use SafeSight360\AttemptService;
use SafeSight360\Database;
use SafeSight360\TrainingRepository;

require_once dirname(__DIR__) . '/src/Database.php';
require_once dirname(__DIR__) . '/src/TrainingRepository.php';
require_once dirname(__DIR__) . '/src/AttemptService.php';

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

    foreach (['warehouse-hazard-hunt', 'manual-handling', 'working-at-height', 'five-whys', 'unsafe-acts', 'cyber-awareness'] as $slug) {
        $bundle = $repository->getActiveBundle($slug);
        expect(in_array($bundle['scenario']['moduleType'] ?? '', ['panorama', 'puzzle', 'interactive'], true), "$slug is missing moduleType");
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
