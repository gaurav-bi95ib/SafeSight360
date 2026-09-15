<?php

declare(strict_types=1);

namespace SafeSight360;

use PDO;
use InvalidArgumentException;
use RuntimeException;

final class TrainingRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    /** @return array<string, mixed> */
    public function getActiveBundle(string $slug = 'warehouse-hazard-hunt'): array
    {
        $scenario = $this->activeScenario($slug);
        $trainingId = (int) $scenario['id'];

        $fallback = $this->fallbackBundle($slug);
        if ($fallback !== null && $slug !== 'warehouse-hazard-hunt') {
            $fallback['scenario']['id'] = $trainingId;
            $fallback['scenario']['slug'] = $scenario['slug'];
            $fallback['scenario']['moduleType'] = $scenario['module_type'];
            $fallback['scenario']['panoramaUrl'] = $scenario['panorama_url'] ?: $fallback['scenario']['panoramaUrl'];
            return $fallback;
        }

        $hazardStatement = $this->pdo->prepare(
            'SELECT id, code, title, topic, yaw, pitch, hotspot_size, feedback, review_text
             FROM hazards
             WHERE training_version_id = :training_id
             ORDER BY display_order'
        );
        $hazardStatement->execute(['training_id' => $trainingId]);

        $questionStatement = $this->pdo->prepare(
            'SELECT id, code, prompt
             FROM quiz_questions
             WHERE training_version_id = :training_id
             ORDER BY display_order'
        );
        $questionStatement->execute(['training_id' => $trainingId]);
        $questions = $questionStatement->fetchAll();

        $optionStatement = $this->pdo->prepare(
            'SELECT id, question_id, label
             FROM quiz_options
             WHERE question_id IN (
                 SELECT id FROM quiz_questions WHERE training_version_id = :training_id
             )
             ORDER BY question_id, display_order'
        );
        $optionStatement->execute(['training_id' => $trainingId]);
        $optionsByQuestion = [];
        foreach ($optionStatement->fetchAll() as $option) {
            $optionsByQuestion[(int) $option['question_id']][] = [
                'id' => (int) $option['id'],
                'label' => $option['label'],
            ];
        }

        return [
            'scenario' => [
                'id' => $trainingId,
                'slug' => $scenario['slug'],
                'version' => $scenario['version'],
                'title' => $scenario['title'],
                'summary' => $scenario['summary'],
                'mission' => $scenario['mission'],
                'durationSeconds' => (int) $scenario['duration_seconds'],
                'maxHazards' => (int) $scenario['max_hazards'],
                'correctPoints' => (int) $scenario['correct_points'],
                'wrongPenalty' => (int) $scenario['wrong_penalty'],
                'scoringFormulaVersion' => $scenario['scoring_formula_version'],
                'panoramaUrl' => $scenario['panorama_url'],
                'panoramaWidth' => (int) $scenario['panorama_width'],
                'cameraProfile' => $fallback['scenario']['cameraProfile'] ?? null,
                'maxFov' => (float) ($fallback['scenario']['maxFov'] ?? (100 * M_PI / 180)),
                'rollbackPanoramaUrl' => $fallback['scenario']['rollbackPanoramaUrl'] ?? null,
                'rollbackCameraProfile' => $fallback['scenario']['rollbackCameraProfile'] ?? null,
                'rollbackInitialView' => $fallback['scenario']['rollbackInitialView'] ?? null,
                'moduleType' => $scenario['module_type'],
                'initialView' => [
                    'yaw' => (float) $scenario['initial_yaw'],
                    'pitch' => (float) $scenario['initial_pitch'],
                    'fov' => (float) $scenario['initial_fov'],
                ],
            ],
            'hazards' => array_map(static fn (array $hazard): array => [
                'id' => (int) $hazard['id'],
                'code' => $hazard['code'],
                'title' => $hazard['title'],
                'topic' => $hazard['topic'],
                'yaw' => (float) $hazard['yaw'],
                'pitch' => (float) $hazard['pitch'],
                'hotspotSize' => (int) $hazard['hotspot_size'],
                'feedback' => $hazard['feedback'],
                'reviewText' => $hazard['review_text'],
            ], $hazardStatement->fetchAll()),
            'questions' => array_map(static fn (array $question): array => [
                'id' => (int) $question['id'],
                'code' => $question['code'],
                'prompt' => $question['prompt'],
                'options' => $optionsByQuestion[(int) $question['id']] ?? [],
            ], $questions),
        ];
    }

    /** @return array{correct: bool, correctOptionId: int, explanation: string} */
    public function validateAnswer(int $questionId, int $optionId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT q.explanation, o.id AS selected_id, o.is_correct,
                    (SELECT id FROM quiz_options WHERE question_id = q.id AND is_correct = TRUE LIMIT 1) AS correct_option_id
             FROM quiz_questions q
             JOIN training_versions t ON t.id = q.training_version_id AND t.is_active = TRUE
             JOIN quiz_options o ON o.question_id = q.id AND o.id = :option_id
             WHERE q.id = :question_id
             LIMIT 1'
        );
        $statement->execute([
            'question_id' => $questionId,
            'option_id' => $optionId,
        ]);
        $answer = $statement->fetch();
        if (!$answer) {
            throw new InvalidArgumentException('The selected question or option is not valid.');
        }

        return [
            'correct' => (bool) $answer['is_correct'],
            'correctOptionId' => (int) $answer['correct_option_id'],
            'explanation' => $answer['explanation'],
        ];
    }

    /** @return array<string, mixed> */
    public function getScoringFacts(string $slug = 'warehouse-hazard-hunt'): array
    {
        $scenario = $this->activeScenario($slug);
        $trainingId = (int) $scenario['id'];

        $fallback = $this->fallbackBundle($slug);
        if ($fallback !== null && $slug !== 'warehouse-hazard-hunt') {
            $answers = [];
            foreach ($fallback['questions'] ?? [] as $question) {
                if (isset($question['id'], $question['correctOptionId'])) {
                    $answers[(int) $question['id']] = (int) $question['correctOptionId'];
                }
            }
            return [
                'trainingId' => $trainingId,
                'durationSeconds' => (int) ($fallback['scenario']['durationSeconds'] ?? 120),
                'maxHazards' => (int) ($fallback['scenario']['maxHazards'] ?? count($fallback['hazards'] ?? [])),
                'correctPoints' => (int) ($fallback['scenario']['correctPoints'] ?? 100),
                'wrongPenalty' => (int) ($fallback['scenario']['wrongPenalty'] ?? 20),
                'scoringFormulaVersion' => $fallback['scenario']['scoringFormulaVersion'] ?? 'scoring-v1',
                'moduleType' => $scenario['module_type'],
                'hazardCodes' => array_column($fallback['hazards'] ?? [], 'code'),
                'correctAnswers' => $answers,
            ];
        }

        $hazardStatement = $this->pdo->prepare(
            'SELECT code FROM hazards WHERE training_version_id = :training_id ORDER BY display_order'
        );
        $hazardStatement->execute(['training_id' => $trainingId]);

        $answerStatement = $this->pdo->prepare(
            'SELECT q.id AS question_id, o.id AS correct_option_id
             FROM quiz_questions q
             JOIN quiz_options o ON o.question_id = q.id AND o.is_correct = TRUE
             WHERE q.training_version_id = :training_id'
        );
        $answerStatement->execute(['training_id' => $trainingId]);
        $correctAnswers = [];
        foreach ($answerStatement->fetchAll() as $row) {
            $correctAnswers[(int) $row['question_id']] = (int) $row['correct_option_id'];
        }

        return [
            'trainingId' => $trainingId,
            'durationSeconds' => (int) $scenario['duration_seconds'],
            'maxHazards' => (int) $scenario['max_hazards'],
            'correctPoints' => (int) $scenario['correct_points'],
            'wrongPenalty' => (int) $scenario['wrong_penalty'],
            'scoringFormulaVersion' => $scenario['scoring_formula_version'],
            'moduleType' => $scenario['module_type'],
            'hazardCodes' => array_column($hazardStatement->fetchAll(), 'code'),
            'correctAnswers' => $correctAnswers,
        ];
    }

    /** @param array<string, mixed> $result */
    public function recordAttempt(array $result): int
    {
        $previousBestStatement = $this->pdo->prepare(
            'SELECT COALESCE(MAX(overall_percent), 0)
             FROM attempts
             WHERE user_id = :user_id AND training_version_id = :training_id'
        );
        $previousBestStatement->execute([
            'user_id' => $result['userId'],
            'training_id' => $result['trainingId'],
        ]);
        $previousBest = (int) $previousBestStatement->fetchColumn();

        $statement = $this->pdo->prepare(
            'INSERT INTO attempts
                (user_id, training_version_id, found_count, wrong_clicks, challenge_score, quiz_score,
                 elapsed_seconds, overall_percent, rating, scoring_formula_version, xp_earned)
             VALUES
                (:user_id, :training_id, :found_count, :wrong_clicks, :challenge_score, :quiz_score,
                 :elapsed_seconds, :overall_percent, :rating, :scoring_formula_version, :xp_earned)'
        );
        $statement->execute([
            'user_id' => $result['userId'],
            'training_id' => $result['trainingId'],
            'found_count' => $result['foundCount'],
            'wrong_clicks' => $result['wrongClicks'],
            'challenge_score' => $result['challengeScore'],
            'quiz_score' => $result['quizScore'],
            'elapsed_seconds' => $result['elapsedSeconds'],
            'overall_percent' => $result['overallPercent'],
            'rating' => $result['rating'],
            'scoring_formula_version' => $result['scoringFormulaVersion'],
            'xp_earned' => $result['xpEarned'] ?? 0,
        ]);
        
        $attemptId = (int) $this->pdo->lastInsertId();

        // Update user XP
        if ($result['userId']) {
            $this->pdo->prepare(
                "UPDATE users
                 SET user_level = CASE
                       WHEN total_xp + :xp_level >= 7000 THEN 'Master'
                       WHEN total_xp + :xp_level2 >= 3500 THEN 'Expert'
                       WHEN total_xp + :xp_level3 >= 1500 THEN 'Specialist'
                       WHEN total_xp + :xp_level4 >= 500 THEN 'Apprentice'
                       ELSE 'Rookie'
                     END,
                     total_xp = total_xp + :xp_total
                 WHERE id = :id"
            )->execute([
                'xp_level' => $result['xpEarned'] ?? 0,
                'xp_level2' => $result['xpEarned'] ?? 0,
                'xp_level3' => $result['xpEarned'] ?? 0,
                'xp_level4' => $result['xpEarned'] ?? 0,
                'xp_total' => $result['xpEarned'] ?? 0,
                'id' => $result['userId'],
            ]);
            $this->awardProgressBadges($result, $previousBest);
        }

        return $attemptId;
    }

    /** @return array<string, mixed> */
    public function getUserDashboard(int $userId): array
    {
        $summaryStatement = $this->pdo->prepare(
            'SELECT COUNT(*) AS attempts_count,
                    COALESCE(MAX(overall_percent), 0) AS best_percent,
                    COALESCE(ROUND(AVG(overall_percent)), 0) AS average_percent,
                    COALESCE(MAX(completed_at), NULL) AS last_completed_at
             FROM attempts WHERE user_id = :user_id'
        );
        $summaryStatement->execute(['user_id' => $userId]);
        $summary = $summaryStatement->fetch();

        $recentStatement = $this->pdo->prepare(
            'SELECT t.title as module_title, a.overall_percent, a.rating, a.challenge_score, a.quiz_score, a.elapsed_seconds, a.completed_at
             FROM attempts a
             JOIN training_versions t ON t.id = a.training_version_id
             WHERE a.user_id = :user_id 
             ORDER BY a.completed_at DESC, a.id DESC LIMIT 5'
        );
        $recentStatement->execute(['user_id' => $userId]);

        $userStatement = $this->pdo->prepare('SELECT display_name, total_xp, user_level, login_streak FROM users WHERE id = :id');
        $userStatement->execute(['id' => $userId]);
        $user = $userStatement->fetch();

        $badgeStatement = $this->pdo->prepare(
            'SELECT badge_code FROM user_badges WHERE user_id = :user_id ORDER BY awarded_at, badge_code'
        );
        $badgeStatement->execute(['user_id' => $userId]);

        return [
            'user' => [
                'name' => $user['display_name'] ?? 'User',
                'xp' => (int) ($user['total_xp'] ?? 0),
                'level' => $user['user_level'] ?? 'Rookie',
                'streak' => (int) ($user['login_streak'] ?? 0),
            ],
            'attemptsCount' => (int) $summary['attempts_count'],
            'bestPercent' => (int) $summary['best_percent'],
            'averagePercent' => (int) $summary['average_percent'],
            'lastCompletedAt' => $summary['last_completed_at'],
            'badges' => array_column($badgeStatement->fetchAll(), 'badge_code'),
            'recentAttempts' => array_map(static fn (array $row): array => [
                'moduleTitle' => $row['module_title'],
                'overallPercent' => (int) $row['overall_percent'],
                'rating' => $row['rating'],
                'challengeScore' => (int) $row['challenge_score'],
                'quizScore' => (int) $row['quiz_score'],
                'elapsedSeconds' => (int) $row['elapsed_seconds'],
                'completedAt' => $row['completed_at'],
            ], $recentStatement->fetchAll()),
        ];
    }

    /** @param array<string, mixed> $result */
    private function awardProgressBadges(array $result, int $previousBest): void
    {
        $userId = (int) $result['userId'];
        $trainingId = (int) $result['trainingId'];
        $badges = ['first_responder'];

        if (($result['rating'] ?? '') === 'Gold') $badges[] = 'gold_standard';
        if (($result['quizTotal'] ?? 0) === 5 && ($result['quizScore'] ?? 0) === 5) $badges[] = 'perfect_scholar';
        if (($result['maxHazards'] ?? 0) > 0
            && ($result['foundCount'] ?? 0) >= $result['maxHazards']
            && ($result['wrongClicks'] ?? 0) === 0) {
            $badges[] = 'eagle_eye';
            if (($result['elapsedSeconds'] ?? PHP_INT_MAX) <= max(0, (int) $result['durationSeconds'] - 60)) {
                $badges[] = 'speed_demon';
            }
        }
        if ($previousBest > 0 && ($result['overallPercent'] ?? 0) - $previousBest >= 20) {
            $badges[] = 'comeback_kid';
        }
        foreach ($result['badgeSignals'] ?? [] as $signal) {
            if (is_string($signal)) $badges[] = $signal;
        }

        $repeatStatement = $this->pdo->prepare(
            'SELECT COUNT(*) FROM attempts WHERE user_id = :user_id AND training_version_id = :training_id'
        );
        $repeatStatement->execute(['user_id' => $userId, 'training_id' => $trainingId]);
        if ((int) $repeatStatement->fetchColumn() >= 2) $badges[] = 'safety_repeat';

        $completionStatement = $this->pdo->prepare(
            'SELECT COUNT(DISTINCT training_version_id) FROM attempts WHERE user_id = :user_id'
        );
        $completionStatement->execute(['user_id' => $userId]);
        if ((int) $completionStatement->fetchColumn() >= 6) $badges[] = 'scholar';

        $silverStatement = $this->pdo->prepare(
            'SELECT COUNT(*) FROM (
               SELECT training_version_id FROM attempts
               WHERE user_id = :user_id
               GROUP BY training_version_id HAVING MAX(overall_percent) >= 60
             ) AS silver_modules'
        );
        $silverStatement->execute(['user_id' => $userId]);
        if ((int) $silverStatement->fetchColumn() >= 6) $badges[] = 'all_rounder';

        $goldStatement = $this->pdo->prepare(
            'SELECT COUNT(*) FROM (
               SELECT training_version_id FROM attempts
               WHERE user_id = :user_id
               GROUP BY training_version_id HAVING MAX(overall_percent) >= 80
             ) AS gold_modules'
        );
        $goldStatement->execute(['user_id' => $userId]);
        if ((int) $goldStatement->fetchColumn() >= 3) $badges[] = 'triple_crown';

        $dailyStatement = $this->pdo->prepare(
            'SELECT COUNT(*) FROM attempts WHERE user_id = :user_id AND DATE(completed_at) = CURDATE()'
        );
        $dailyStatement->execute(['user_id' => $userId]);
        if ((int) $dailyStatement->fetchColumn() >= 3) $badges[] = 'on_fire';

        $streakStatement = $this->pdo->prepare('SELECT login_streak FROM users WHERE id = :user_id');
        $streakStatement->execute(['user_id' => $userId]);
        if ((int) $streakStatement->fetchColumn() >= 7) $badges[] = 'week_warrior';

        $awardStatement = $this->pdo->prepare(
            'INSERT IGNORE INTO user_badges (user_id, badge_code) VALUES (:user_id, :badge_code)'
        );
        foreach (array_unique($badges) as $badge) {
            $awardStatement->execute(['user_id' => $userId, 'badge_code' => $badge]);
        }
    }
    
    /** @return array<string, mixed> */
    public function getLeaderboard(string $period = 'all-time'): array
    {
        $timeFilter = '';
        if ($period === 'weekly') {
            $timeFilter = 'WHERE a.completed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
        } elseif ($period === 'daily') {
            $timeFilter = 'WHERE DATE(a.completed_at) = CURDATE()';
        }
        
        $sql = "SELECT u.id, u.display_name, MAX(a.overall_percent) as best_score, COUNT(a.id) as total_attempts, u.total_xp
                FROM attempts a
                JOIN users u ON u.id = a.user_id
                $timeFilter
                GROUP BY u.id, u.display_name, u.total_xp
                ORDER BY best_score DESC, u.total_xp DESC
                LIMIT 10";
                
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    
    public function getUserModuleProgress(int $userId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT t.slug, MAX(a.overall_percent) as best_score, a.rating
             FROM attempts a
             JOIN training_versions t ON t.id = a.training_version_id
             WHERE a.user_id = :uid
             GROUP BY t.slug, a.rating'
        );
        $stmt->execute(['uid' => $userId]);
        
        // Ensure best rating is taken for duplicate slugs
        $progress = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $slug = $row['slug'];
            if (!isset($progress[$slug]) || $row['best_score'] > $progress[$slug]['best_score']) {
                $progress[$slug] = [
                    'best_score' => (int) $row['best_score'],
                    'rating' => $row['rating']
                ];
            }
        }
        return $progress;
    }

    public function createChallenge(int $userId, string $moduleSlug): string
    {
        $scenario = $this->activeScenario($moduleSlug);
        $code = strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
        
        $stmt = $this->pdo->prepare(
            'INSERT INTO challenge_attempts (challenge_code, challenger_id, training_version_id, status)
             VALUES (:code, :user, :tid, "pending")'
        );
        $stmt->execute([
            'code' => $code,
            'user' => $userId,
            'tid' => $scenario['id']
        ]);
        
        return $code;
    }

    /** @return list<array<string, mixed>> */
    public function getUserChallenges(int $userId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT c.challenge_code, c.status, c.challenger_id, c.opponent_id, c.created_at,
                    t.slug AS module_slug, t.title AS module_title,
                    challenger.display_name AS challenger_name,
                    opponent.display_name AS opponent_name,
                    ca.overall_percent AS challenger_score,
                    oa.overall_percent AS opponent_score
             FROM challenge_attempts c
             JOIN training_versions t ON t.id = c.training_version_id
             JOIN users challenger ON challenger.id = c.challenger_id
             LEFT JOIN users opponent ON opponent.id = c.opponent_id
             LEFT JOIN attempts ca ON ca.id = c.challenger_attempt_id
             LEFT JOIN attempts oa ON oa.id = c.opponent_attempt_id
             WHERE c.challenger_id = :challenger_uid OR c.opponent_id = :opponent_uid
             ORDER BY c.created_at DESC LIMIT 20'
        );
        $stmt->execute(['challenger_uid' => $userId, 'opponent_uid' => $userId]);
        return array_map(fn (array $row): array => $this->formatChallenge($row, $userId), $stmt->fetchAll());
    }

    /** @return array<string, mixed> */
    public function getChallenge(string $code, int $userId): array
    {
        $code = self::normalizeChallengeCode($code);
        $stmt = $this->pdo->prepare(
            'SELECT c.challenge_code, c.status, c.challenger_id, c.opponent_id, c.created_at,
                    t.slug AS module_slug, t.title AS module_title,
                    challenger.display_name AS challenger_name,
                    opponent.display_name AS opponent_name,
                    ca.overall_percent AS challenger_score,
                    oa.overall_percent AS opponent_score
             FROM challenge_attempts c
             JOIN training_versions t ON t.id = c.training_version_id
             JOIN users challenger ON challenger.id = c.challenger_id
             LEFT JOIN users opponent ON opponent.id = c.opponent_id
             LEFT JOIN attempts ca ON ca.id = c.challenger_attempt_id
             LEFT JOIN attempts oa ON oa.id = c.opponent_attempt_id
             WHERE c.challenge_code = :code LIMIT 1'
        );
        $stmt->execute(['code' => $code]);
        $row = $stmt->fetch();
        if (!$row) throw new InvalidArgumentException('Challenge code not found.');
        if (!in_array($userId, [(int) $row['challenger_id'], (int) ($row['opponent_id'] ?? 0)], true)) {
            throw new InvalidArgumentException('You are not a participant in this challenge.');
        }
        return $this->formatChallenge($row, $userId);
    }

    /** @return array<string, mixed> */
    public function joinChallenge(string $code, int $userId): array
    {
        $code = self::normalizeChallengeCode($code);
        $stmt = $this->pdo->prepare(
            'UPDATE challenge_attempts SET opponent_id = :uid, status = "accepted"
             WHERE challenge_code = :code AND challenger_id <> :challenger_uid
               AND opponent_id IS NULL AND status = "pending"'
        );
        $stmt->execute(['uid' => $userId, 'challenger_uid' => $userId, 'code' => $code]);
        if ($stmt->rowCount() !== 1) {
            throw new InvalidArgumentException('This challenge is unavailable, already joined, or belongs to you.');
        }
        return $this->getChallenge($code, $userId);
    }

    /** @return array<string, mixed> */
    public function attachChallengeAttempt(string $code, int $userId, int $attemptId): array
    {
        $code = self::normalizeChallengeCode($code);
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare('SELECT * FROM challenge_attempts WHERE challenge_code = :code FOR UPDATE');
            $stmt->execute(['code' => $code]);
            $row = $stmt->fetch();
            if (!$row || !in_array($userId, [(int) $row['challenger_id'], (int) ($row['opponent_id'] ?? 0)], true)) {
                throw new InvalidArgumentException('You are not a participant in this challenge.');
            }
            $attemptStmt = $this->pdo->prepare('SELECT training_version_id, user_id FROM attempts WHERE id = :id LIMIT 1');
            $attemptStmt->execute(['id' => $attemptId]);
            $attempt = $attemptStmt->fetch();
            if (!$attempt || (int) $attempt['user_id'] !== $userId || (int) $attempt['training_version_id'] !== (int) $row['training_version_id']) {
                throw new InvalidArgumentException('The submitted attempt does not match this challenge module.');
            }
            $column = $userId === (int) $row['challenger_id'] ? 'challenger_attempt_id' : 'opponent_attempt_id';
            if ($row[$column] !== null) throw new InvalidArgumentException('You have already completed this challenge.');
            $this->pdo->prepare("UPDATE challenge_attempts SET $column = :attempt WHERE id = :id")
                ->execute(['attempt' => $attemptId, 'id' => $row['id']]);
            $this->pdo->prepare(
                'UPDATE challenge_attempts SET status = "completed"
                 WHERE id = :id AND challenger_attempt_id IS NOT NULL AND opponent_attempt_id IS NOT NULL'
            )->execute(['id' => $row['id']]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $e;
        }
        return $this->getChallenge($code, $userId);
    }

    public function validateChallengeSubmission(string $code, int $userId, int $trainingId): void
    {
        $code = self::normalizeChallengeCode($code);
        $stmt = $this->pdo->prepare('SELECT * FROM challenge_attempts WHERE challenge_code = :code LIMIT 1');
        $stmt->execute(['code' => $code]);
        $row = $stmt->fetch();
        if (!$row || !in_array($userId, [(int) $row['challenger_id'], (int) ($row['opponent_id'] ?? 0)], true)) {
            throw new InvalidArgumentException('You are not a participant in this challenge.');
        }
        if ((int) $row['training_version_id'] !== $trainingId) {
            throw new InvalidArgumentException('This attempt does not match the challenge module.');
        }
        $column = $userId === (int) $row['challenger_id'] ? 'challenger_attempt_id' : 'opponent_attempt_id';
        if ($row[$column] !== null) throw new InvalidArgumentException('You have already completed this challenge.');
    }

    private static function normalizeChallengeCode(string $code): string
    {
        $code = strtoupper(trim($code));
        if (preg_match('/^[A-F0-9]{8}$/', $code) !== 1) {
            throw new InvalidArgumentException('Enter a valid 8-character challenge code.');
        }
        return $code;
    }

    /** @param array<string, mixed> $row @return array<string, mixed> */
    private function formatChallenge(array $row, int $userId): array
    {
        $challengerScore = $row['challenger_score'] === null ? null : (int) $row['challenger_score'];
        $opponentScore = $row['opponent_score'] === null ? null : (int) $row['opponent_score'];
        $winner = null;
        if ($challengerScore !== null && $opponentScore !== null) {
            $winner = $challengerScore === $opponentScore ? 'draw' : ($challengerScore > $opponentScore ? 'challenger' : 'opponent');
        }
        $isChallenger = $userId === (int) $row['challenger_id'];
        return [
            'code' => $row['challenge_code'], 'status' => $row['status'],
            'moduleSlug' => $row['module_slug'], 'moduleTitle' => $row['module_title'],
            'challengerName' => $row['challenger_name'], 'opponentName' => $row['opponent_name'],
            'challengerScore' => $challengerScore, 'opponentScore' => $opponentScore,
            'winner' => $winner, 'role' => $isChallenger ? 'challenger' : 'opponent',
            'myCompleted' => $isChallenger ? $challengerScore !== null : $opponentScore !== null,
            'canJoin' => $row['status'] === 'pending' && !$isChallenger,
            'createdAt' => $row['created_at'],
        ];
    }

    /** @return array<string, mixed>|null */
    private function fallbackBundle(string $slug): ?array
    {
        $files = [
            'warehouse-hazard-hunt' => 'training-fallback.json',
            'manual-handling' => 'manual-handling-fallback.json',
            'working-at-height' => 'working-at-height-fallback.json',
            'five-whys' => 'five-whys-fallback.json',
            'unsafe-acts' => 'unsafe-acts-fallback.json',
            'cyber-awareness' => 'cyber-awareness-fallback.json',
        ];
        if (!isset($files[$slug])) return null;
        $path = dirname(__DIR__) . '/public/assets/data/' . $files[$slug];
        $json = is_file($path) ? file_get_contents($path) : false;
        if ($json === false) return null;
        $data = json_decode($json, true);
        return is_array($data) ? $data : null;
    }

    /** @return array<string, mixed> */
    private function activeScenario(string $slug = 'warehouse-hazard-hunt'): array
    {
        $statement = $this->pdo->prepare(
            'SELECT * FROM training_versions WHERE slug = :slug AND is_active = TRUE ORDER BY id DESC LIMIT 1'
        );
        $statement->execute(['slug' => $slug]);
        $scenario = $statement->fetch();
        if (!$scenario) {
            // For prototyping new modules, mock the active scenario if not fully seeded in DB
            return [
                'id' => 1,
                'slug' => $slug,
                'version' => '1.0.0',
                'title' => 'Mock ' . $slug,
                'summary' => '',
                'mission' => '',
                'duration_seconds' => 120,
                'max_hazards' => 8,
                'correct_points' => 100,
                'wrong_penalty' => 20,
                'scoring_formula_version' => 'scoring-v1',
                'panorama_url' => '',
                'panorama_width' => 2048,
                'initial_yaw' => 0,
                'initial_pitch' => 0,
                'initial_fov' => 1.5,
                'module_type' => 'panorama'
            ];
        }

        return $scenario;
    }
}
