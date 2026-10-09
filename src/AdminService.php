<?php

declare(strict_types=1);

namespace SafeSight360;

use InvalidArgumentException;
use PDO;
use PDOException;

final class AdminService
{
    public function __construct(private PDO $pdo, private AuthService $auth)
    {
    }

    /** @return array<string, mixed> */
    public function dashboard(): array
    {
        $summary = $this->pdo->query(
            "SELECT
                SUM(role = 'learner') AS learners_total,
                SUM(role = 'learner' AND account_status = 'active') AS learners_active,
                SUM(role = 'learner' AND account_status = 'inactive') AS learners_inactive
             FROM users"
        )->fetch();

        $assignment = $this->pdo->query(
             "SELECT COUNT(*) AS assignments_total,
                    SUM(status = 'not_started') AS not_started,
                    SUM(status = 'in_progress') AS in_progress,
                    SUM(status = 'completed') AS completed
             FROM training_assignments ta
             JOIN users u ON u.id = ta.user_id AND u.role = 'learner'"
        )->fetch();

        $moduleRows = $this->pdo->query(
            "SELECT t.slug, t.title,
                    COUNT(ta.id) AS assigned_count,
                    SUM(ta.status = 'completed') AS completed_count,
                    COALESCE(ROUND(AVG(best.best_score)), 0) AS average_score
             FROM training_versions t
             LEFT JOIN training_assignments ta ON ta.training_version_id = t.id
                  AND ta.user_id IN (SELECT id FROM users WHERE role = 'learner')
             LEFT JOIN (
                 SELECT user_id, training_version_id, MAX(overall_percent) AS best_score
                 FROM attempts
                 WHERE user_id IS NOT NULL
                 GROUP BY user_id, training_version_id
             ) best ON best.user_id = ta.user_id AND best.training_version_id = ta.training_version_id
             WHERE t.is_active = TRUE
             GROUP BY t.id, t.slug, t.title
             ORDER BY t.id"
        )->fetchAll();

        $totalAssignments = (int) ($assignment['assignments_total'] ?? 0);
        $completed = (int) ($assignment['completed'] ?? 0);
        $pendingRequests = (int) $this->pdo->query(
            "SELECT COUNT(*) FROM access_requests WHERE status = 'pending'"
        )->fetchColumn();

        return [
            'learnersTotal' => (int) ($summary['learners_total'] ?? 0),
            'learnersActive' => (int) ($summary['learners_active'] ?? 0),
            'learnersInactive' => (int) ($summary['learners_inactive'] ?? 0),
            'pendingRequests' => $pendingRequests,
            'assignmentsTotal' => $totalAssignments,
            'notStarted' => (int) ($assignment['not_started'] ?? 0),
            'inProgress' => (int) ($assignment['in_progress'] ?? 0),
            'completed' => $completed,
            'completionRate' => $totalAssignments > 0 ? (int) round(100 * $completed / $totalAssignments) : 0,
            'modules' => array_map(static fn (array $row): array => [
                'slug' => $row['slug'],
                'title' => $row['title'],
                'assignedCount' => (int) $row['assigned_count'],
                'completedCount' => (int) $row['completed_count'],
                'averageScore' => (int) $row['average_score'],
            ], $moduleRows),
        ];
    }

    /** @return list<array<string, mixed>> */
    public function learners(string $search = ''): array
    {
        $search = trim($search);
        if (strlen($search) > 100) {
            throw new InvalidArgumentException('Search text is too long.');
        }

        $statement = $this->pdo->prepare(
            "SELECT u.id, u.display_name, u.email, u.account_status, u.total_xp,
                    u.user_level, u.created_at, u.last_login_at,
                    COUNT(ta.id) AS assigned_count,
                    SUM(ta.status = 'not_started') AS not_started_count,
                    SUM(ta.status = 'in_progress') AS in_progress_count,
                    SUM(ta.status = 'completed') AS completed_count,
                    COALESCE(MAX(best.best_score), 0) AS best_score
             FROM users u
             LEFT JOIN training_assignments ta ON ta.user_id = u.id
             LEFT JOIN (
                 SELECT user_id, training_version_id, MAX(overall_percent) AS best_score
                 FROM attempts
                 WHERE user_id IS NOT NULL
                 GROUP BY user_id, training_version_id
             ) best ON best.user_id = u.id AND best.training_version_id = ta.training_version_id
             WHERE u.role = 'learner'
               AND (:search = '' OR u.display_name LIKE :search_like OR u.email LIKE :search_like_two)
             GROUP BY u.id, u.display_name, u.email, u.account_status, u.total_xp,
                      u.user_level, u.created_at, u.last_login_at
             ORDER BY u.created_at DESC
             LIMIT 250"
        );
        $statement->execute([
            'search' => $search,
            'search_like' => '%' . $search . '%',
            'search_like_two' => '%' . $search . '%',
        ]);

        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'displayName' => $row['display_name'],
            'email' => $row['email'],
            'status' => $row['account_status'],
            'totalXp' => (int) $row['total_xp'],
            'level' => $row['user_level'],
            'createdAt' => $row['created_at'],
            'lastLoginAt' => $row['last_login_at'],
            'assignedCount' => (int) $row['assigned_count'],
            'notStartedCount' => (int) $row['not_started_count'],
            'inProgressCount' => (int) $row['in_progress_count'],
            'completedCount' => (int) $row['completed_count'],
            'bestScore' => (int) $row['best_score'],
        ], $statement->fetchAll());
    }

    /** @return list<array<string, mixed>> */
    public function modules(): array
    {
        $rows = $this->pdo->query(
            "SELECT id, slug, title, module_type, duration_seconds
             FROM training_versions WHERE is_active = TRUE ORDER BY id"
        )->fetchAll();
        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'slug' => $row['slug'],
            'title' => $row['title'],
            'type' => $row['module_type'],
            'durationSeconds' => (int) $row['duration_seconds'],
        ], $rows);
    }

    /** @return list<array<string, mixed>> */
    public function reports(?int $learnerId = null): array
    {
        $statement = $this->pdo->prepare(
            "SELECT a.id, a.user_id, u.display_name, u.email, t.slug, t.title,
                    a.overall_percent, a.rating, a.xp_earned, a.elapsed_seconds, a.completed_at
             FROM attempts a
             JOIN users u ON u.id = a.user_id AND u.role = 'learner'
             JOIN training_versions t ON t.id = a.training_version_id
             WHERE (:learner_id IS NULL OR a.user_id = :learner_id_two)
             ORDER BY a.completed_at DESC
             LIMIT 250"
        );
        $statement->execute([
            'learner_id' => $learnerId,
            'learner_id_two' => $learnerId,
        ]);
        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'learnerId' => (int) $row['user_id'],
            'learnerName' => $row['display_name'],
            'email' => $row['email'],
            'moduleSlug' => $row['slug'],
            'moduleTitle' => $row['title'],
            'score' => (int) $row['overall_percent'],
            'rating' => $row['rating'],
            'xpEarned' => (int) $row['xp_earned'],
            'elapsedSeconds' => (int) $row['elapsed_seconds'],
            'completedAt' => $row['completed_at'],
        ], $statement->fetchAll());
    }

    /** @return list<array<string, mixed>> */
    public function accessRequests(): array
    {
        $rows = $this->pdo->query(
            "SELECT ar.id, ar.display_name, ar.email, ar.status, ar.review_note,
                    ar.created_at, ar.reviewed_at, reviewer.display_name AS reviewer_name
             FROM access_requests ar
             LEFT JOIN users reviewer ON reviewer.id = ar.reviewed_by
             ORDER BY FIELD(ar.status, 'pending', 'approved', 'rejected'), ar.created_at DESC
             LIMIT 200"
        )->fetchAll();
        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'displayName' => $row['display_name'],
            'email' => $row['email'],
            'status' => $row['status'],
            'reviewNote' => $row['review_note'],
            'createdAt' => $row['created_at'],
            'reviewedAt' => $row['reviewed_at'],
            'reviewerName' => $row['reviewer_name'],
        ], $rows);
    }

    /** @return array<string, mixed> */
    public function approveAccessRequest(int $adminId, int $requestId): array
    {
        if ($requestId < 1) throw new InvalidArgumentException('Access request is invalid.');
        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            $statement = $this->pdo->prepare(
                "SELECT id, display_name, email, password_hash, status
                 FROM access_requests WHERE id = :id FOR UPDATE"
            );
            $statement->execute(['id' => $requestId]);
            $request = $statement->fetch();
            if (!$request || $request['status'] !== 'pending') {
                throw new InvalidArgumentException('This access request is no longer pending.');
            }

            $email = AuthService::normaliseOrganisationEmail($request['email']);
            $insert = $this->pdo->prepare(
                "INSERT INTO users (display_name, email, password_hash, role, account_status)
                 VALUES (:display_name, :email, :password_hash, 'learner', 'active')"
            );
            $insert->execute([
                'display_name' => $request['display_name'],
                'email' => $email,
                'password_hash' => $request['password_hash'],
            ]);
            $learnerId = (int) $this->pdo->lastInsertId();

            $update = $this->pdo->prepare(
                "UPDATE access_requests
                 SET status = 'approved', reviewed_by = :reviewer, reviewed_at = CURRENT_TIMESTAMP,
                     review_note = NULL, password_hash = ''
                 WHERE id = :id"
            );
            $update->execute(['reviewer' => $adminId, 'id' => $requestId]);
            $this->audit($adminId, 'access.approved', $learnerId, ['requestId' => $requestId, 'email' => $email]);
            if ($ownsTransaction) $this->pdo->commit();
            return [
                'id' => $learnerId,
                'displayName' => $request['display_name'],
                'email' => $email,
                'role' => 'learner',
                'status' => 'active',
            ];
        } catch (PDOException $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            if ($exception->getCode() === '23000') {
                throw new InvalidArgumentException('An account already exists for this organisational email.');
            }
            throw $exception;
        } catch (\Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

    public function rejectAccessRequest(int $adminId, int $requestId, string $note = ''): void
    {
        if ($requestId < 1) throw new InvalidArgumentException('Access request is invalid.');
        $note = trim($note);
        if (strlen($note) > 500) throw new InvalidArgumentException('Review note is too long.');
        $statement = $this->pdo->prepare(
            "UPDATE access_requests
             SET status = 'rejected', review_note = :note, reviewed_by = :reviewer,
                 reviewed_at = CURRENT_TIMESTAMP, password_hash = ''
             WHERE id = :id AND status = 'pending'"
        );
        $statement->execute([
            'note' => $note === '' ? null : $note,
            'reviewer' => $adminId,
            'id' => $requestId,
        ]);
        if ($statement->rowCount() !== 1) {
            throw new InvalidArgumentException('This access request is no longer pending.');
        }
        $this->audit($adminId, 'access.rejected', null, ['requestId' => $requestId]);
    }

    /** @return array<string, mixed> */
    public function moduleContent(string $slug): array
    {
        $this->assertModuleSlug($slug);
        return (new TrainingRepository($this->pdo))->getEditableBundle($slug);
    }

    /** @param array<string, mixed> $file @return array{url: string, width: int, height: int} */
    public function uploadPanorama(int $adminId, array $file): array
    {
        $error = $file['error'] ?? UPLOAD_ERR_NO_FILE;
        $size = $file['size'] ?? 0;
        $temporaryPath = $file['tmp_name'] ?? '';
        if ($error !== UPLOAD_ERR_OK || !is_int($size) || $size < 1 || $size > 25 * 1024 * 1024
            || !is_string($temporaryPath) || !is_uploaded_file($temporaryPath)) {
            throw new InvalidArgumentException('Choose a valid panorama image no larger than 25 MB.');
        }
        $image = getimagesize($temporaryPath);
        if (!is_array($image) || !isset($image[0], $image[1], $image['mime'])) {
            throw new InvalidArgumentException('The uploaded file is not a readable image.');
        }
        $width = (int) $image[0];
        $height = (int) $image[1];
        $extensions = [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
        ];
        if (!isset($extensions[$image['mime']])) {
            throw new InvalidArgumentException('Use a JPEG, PNG or WebP panorama image.');
        }
        if ($width < 2048 || $height < 1024 || $width > 32768 || $height > 16384
            || abs(($width / $height) - 2.0) > 0.02) {
            throw new InvalidArgumentException('Panorama images must be high-quality 2:1 equirectangular images of at least 2048×1024 pixels.');
        }

        $directory = dirname(__DIR__) . '/public/assets/panorama/uploads';
        if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
            throw new InvalidArgumentException('The panorama upload directory is unavailable.');
        }
        $filename = sprintf('panorama-%s-%s.%s', gmdate('Ymd-His'), bin2hex(random_bytes(6)), $extensions[$image['mime']]);
        $destination = $directory . '/' . $filename;
        if (!move_uploaded_file($temporaryPath, $destination)) {
            throw new InvalidArgumentException('The panorama image could not be stored.');
        }
        $url = '/assets/panorama/uploads/' . $filename;
        $this->audit($adminId, 'panorama.uploaded', null, [
            'url' => $url,
            'width' => $width,
            'height' => $height,
        ]);
        return ['url' => $url, 'width' => $width, 'height' => $height];
    }

    /** @param array<string, mixed> $payload @return array<string, mixed> */
    public function saveModuleContent(int $adminId, string $slug, array $payload): array
    {
        $this->assertModuleSlug($slug);
        $moduleStatement = $this->pdo->prepare(
            'SELECT id, module_type FROM training_versions WHERE slug = :slug AND is_active = TRUE LIMIT 1'
        );
        $moduleStatement->execute(['slug' => $slug]);
        $module = $moduleStatement->fetch();
        if (!$module) throw new InvalidArgumentException('Training module was not found.');
        $moduleId = (int) $module['id'];
        $moduleType = $module['module_type'];

        $scenarioInput = $payload['scenario'] ?? null;
        $hazardsInput = $payload['hazards'] ?? null;
        $questionsInput = $payload['questions'] ?? null;
        if (!is_array($scenarioInput) || !is_array($hazardsInput) || !is_array($questionsInput)) {
            throw new InvalidArgumentException('Module settings, hotspots and questions are required.');
        }

        $title = $this->requiredString($scenarioInput['title'] ?? null, 'Module title', 2, 160);
        $summary = $this->requiredString($scenarioInput['summary'] ?? null, 'Module summary', 10, 3000);
        $mission = $this->requiredString($scenarioInput['mission'] ?? null, 'Module mission', 10, 3000);
        $duration = $this->boundedInt($scenarioInput['durationSeconds'] ?? null, 'Duration', 30, 3600);
        if ($moduleType === 'panorama') {
            $panoramaUrl = trim((string) ($scenarioInput['panoramaUrl'] ?? ''));
            $panoramaWidth = $this->boundedInt($scenarioInput['panoramaWidth'] ?? 2048, 'Panorama width', 512, 32768);
            $yaw = $this->boundedFloat($scenarioInput['initialView']['yaw'] ?? null, 'Initial yaw', -3.142, 3.142);
            $pitch = $this->boundedFloat($scenarioInput['initialView']['pitch'] ?? null, 'Initial pitch', -1.571, 1.571);
            $fov = $this->boundedFloat($scenarioInput['initialView']['fov'] ?? null, 'Initial field of view', 0.5, 3.142);
            if (preg_match('#^/?assets/[a-zA-Z0-9_./-]+$#', $panoramaUrl) !== 1) {
                throw new InvalidArgumentException('Use a valid local assets path or upload a panorama image.');
            }
        } else {
            $panoramaUrl = '';
            $panoramaWidth = 2048;
            $yaw = 0.0;
            $pitch = 0.0;
            $fov = 1.570796;
        }

        if (count($hazardsInput) > 30 || ($moduleType === 'panorama' && count($hazardsInput) < 1)) {
            throw new InvalidArgumentException('Panorama modules require between 1 and 30 hotspots.');
        }
        $hazards = [];
        $usedCodes = [];
        foreach (array_values($hazardsInput) as $index => $hazard) {
            if (!is_array($hazard)) throw new InvalidArgumentException('A hotspot entry is invalid.');
            $code = strtoupper(trim((string) ($hazard['code'] ?? '')));
            if (preg_match('/^[A-Z0-9]{2,8}$/', $code) !== 1 || isset($usedCodes[$code])) {
                throw new InvalidArgumentException('Each hotspot needs a unique 2-8 character code.');
            }
            $usedCodes[$code] = true;
            $hazards[] = [
                'id' => $moduleId * 1000 + $index + 1,
                'code' => $code,
                'title' => $this->requiredString($hazard['title'] ?? null, 'Hotspot title', 2, 160),
                'topic' => $this->requiredString($hazard['topic'] ?? null, 'Hotspot topic', 2, 120),
                'yaw' => $this->boundedFloat($hazard['yaw'] ?? null, 'Hotspot yaw', -3.142, 3.142),
                'pitch' => $this->boundedFloat($hazard['pitch'] ?? null, 'Hotspot pitch', -1.571, 1.571),
                'hotspotSize' => $this->boundedInt($hazard['hotspotSize'] ?? 52, 'Hotspot size', 28, 100),
                'feedback' => $this->requiredString($hazard['feedback'] ?? null, 'Hotspot feedback', 5, 3000),
                'reviewText' => $this->requiredString($hazard['reviewText'] ?? null, 'Hotspot review text', 5, 3000),
            ];
        }

        if (count($questionsInput) > 20 || ($moduleType === 'panorama' && count($questionsInput) < 1)) {
            throw new InvalidArgumentException('Panorama modules require between 1 and 20 knowledge-check questions.');
        }
        $questions = [];
        foreach (array_values($questionsInput) as $questionIndex => $question) {
            if (!is_array($question)) throw new InvalidArgumentException('A question entry is invalid.');
            $optionsInput = $question['options'] ?? null;
            if (!is_array($optionsInput) || count($optionsInput) < 2 || count($optionsInput) > 6) {
                throw new InvalidArgumentException('Each question requires between 2 and 6 options.');
            }
            $correctIndex = $this->boundedInt($question['correctIndex'] ?? null, 'Correct answer', 0, count($optionsInput) - 1);
            $questionId = $moduleId * 10000 + $questionIndex + 1;
            $options = [];
            foreach (array_values($optionsInput) as $optionIndex => $option) {
                $options[] = [
                    'id' => $questionId * 10 + $optionIndex + 1,
                    'label' => $this->requiredString(
                        is_array($option) ? ($option['label'] ?? null) : $option,
                        'Answer option',
                        1,
                        255
                    ),
                ];
            }
            $questions[] = [
                'id' => $questionId,
                'code' => 'Q' . ($questionIndex + 1),
                'prompt' => $this->requiredString($question['prompt'] ?? null, 'Question', 5, 3000),
                'correctOptionId' => $options[$correctIndex]['id'],
                'explanation' => $this->requiredString($question['explanation'] ?? null, 'Answer explanation', 5, 3000),
                'options' => $options,
            ];
        }

        $content = [
            'scenario' => [
                'id' => $moduleId,
                'slug' => $slug,
                'title' => $title,
                'summary' => $summary,
                'mission' => $mission,
                'durationSeconds' => $duration,
                'maxHazards' => count($hazards),
                'panoramaUrl' => $panoramaUrl,
                'panoramaWidth' => $panoramaWidth,
                'moduleType' => $moduleType,
                'initialView' => ['yaw' => $yaw, 'pitch' => $pitch, 'fov' => $fov],
            ],
            'hazards' => $hazards,
            'questions' => $questions,
        ];
        $json = json_encode($content, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        $update = $this->pdo->prepare(
            'UPDATE training_versions
             SET title = :title, summary = :summary, mission = :mission,
                 duration_seconds = :duration, max_hazards = :max_hazards,
                 panorama_url = :panorama_url, panorama_width = :panorama_width,
                 initial_yaw = :yaw, initial_pitch = :pitch, initial_fov = :fov,
                 content_json = :content_json
             WHERE id = :id'
        );
        $update->execute([
            'title' => $title,
            'summary' => $summary,
            'mission' => $mission,
            'duration' => $duration,
            'max_hazards' => count($hazards),
            'panorama_url' => $panoramaUrl,
            'panorama_width' => $panoramaWidth,
            'yaw' => $yaw,
            'pitch' => $pitch,
            'fov' => $fov,
            'content_json' => $json,
            'id' => $moduleId,
        ]);
        $this->audit($adminId, 'module.content.updated', null, [
            'slug' => $slug,
            'hotspots' => count($hazards),
            'questions' => count($questions),
        ]);
        return $content;
    }

    /** @return array<string, mixed> */
    public function createLearner(int $adminId, string $name, string $email, string $password): array
    {
        $learner = $this->auth->createLearner($name, $email, $password, false);
        $this->audit($adminId, 'learner.created', $learner['id'], ['email' => $learner['email']]);
        return $learner;
    }

    /** @return array<string, mixed> */
    public function updateLearner(
        int $adminId,
        int $learnerId,
        string $name,
        string $email,
        string $status,
        ?string $password = null
    ): array {
        $name = preg_replace('/\s+/', ' ', trim($name)) ?? '';
        $email = AuthService::normaliseOrganisationEmail($email);
        if (strlen($name) < 2 || strlen($name) > 80) {
            throw new InvalidArgumentException('Learner name must contain between 2 and 80 characters.');
        }
        if (!in_array($status, ['active', 'inactive'], true)) {
            throw new InvalidArgumentException('Account status is invalid.');
        }
        $this->assertLearner($learnerId);

        $fields = [
            'display_name = :display_name',
            'email = :email',
            'account_status = :account_status',
            'deactivated_at = CASE WHEN :inactive = 1 THEN COALESCE(deactivated_at, CURRENT_TIMESTAMP) ELSE NULL END',
        ];
        $parameters = [
            'display_name' => $name,
            'email' => $email,
            'account_status' => $status,
            'inactive' => $status === 'inactive' ? 1 : 0,
            'id' => $learnerId,
        ];
        if ($password !== null && $password !== '') {
            $this->validatePassword($password);
            $hash = password_hash($password, PASSWORD_DEFAULT);
            if (!is_string($hash)) throw new InvalidArgumentException('The password could not be secured.');
            $fields[] = 'password_hash = :password_hash';
            $parameters['password_hash'] = $hash;
        }

        try {
            $statement = $this->pdo->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = :id AND role = "learner"');
            $statement->execute($parameters);
        } catch (PDOException $exception) {
            if ($exception->getCode() === '23000') {
                throw new InvalidArgumentException('Another account already uses that email address.');
            }
            throw $exception;
        }
        $this->audit($adminId, 'learner.updated', $learnerId, ['status' => $status]);
        return ['id' => $learnerId, 'displayName' => $name, 'email' => $email, 'status' => $status];
    }

    public function deactivateLearner(int $adminId, int $learnerId): void
    {
        $this->assertLearner($learnerId);
        $statement = $this->pdo->prepare(
            "UPDATE users SET account_status = 'inactive', deactivated_at = CURRENT_TIMESTAMP
             WHERE id = :id AND role = 'learner'"
        );
        $statement->execute(['id' => $learnerId]);
        $this->audit($adminId, 'learner.deactivated', $learnerId, []);
    }

    /** @param list<string> $moduleSlugs @return array{assigned: int} */
    public function assignTraining(int $adminId, int $learnerId, array $moduleSlugs): array
    {
        $this->assertLearner($learnerId, true);
        $moduleSlugs = array_values(array_unique(array_filter(
            $moduleSlugs,
            static fn (mixed $slug): bool => is_string($slug) && preg_match('/^[a-z0-9-]{3,80}$/', $slug) === 1
        )));
        if ($moduleSlugs === [] || count($moduleSlugs) > 20) {
            throw new InvalidArgumentException('Select at least one valid training module.');
        }

        $placeholders = implode(',', array_fill(0, count($moduleSlugs), '?'));
        $moduleStatement = $this->pdo->prepare(
            "SELECT id, slug FROM training_versions WHERE is_active = TRUE AND slug IN ($placeholders)"
        );
        $moduleStatement->execute($moduleSlugs);
        $modules = $moduleStatement->fetchAll();
        if (count($modules) !== count($moduleSlugs)) {
            throw new InvalidArgumentException('One or more selected modules are unavailable.');
        }

        $insert = $this->pdo->prepare(
            "INSERT INTO training_assignments (user_id, training_version_id, assigned_by, status)
             VALUES (:user_id, :training_id, :assigned_by, 'not_started')
             ON DUPLICATE KEY UPDATE assigned_by = VALUES(assigned_by), assigned_at = CURRENT_TIMESTAMP"
        );
        foreach ($modules as $module) {
            $insert->execute([
                'user_id' => $learnerId,
                'training_id' => (int) $module['id'],
                'assigned_by' => $adminId,
            ]);
        }
        $this->audit($adminId, 'training.assigned', $learnerId, ['modules' => $moduleSlugs]);
        return ['assigned' => count($modules)];
    }

    private function assertLearner(int $learnerId, bool $mustBeActive = false): void
    {
        if ($learnerId < 1) throw new InvalidArgumentException('Learner is invalid.');
        $statement = $this->pdo->prepare(
            "SELECT account_status FROM users WHERE id = :id AND role = 'learner' LIMIT 1"
        );
        $statement->execute(['id' => $learnerId]);
        $status = $statement->fetchColumn();
        if ($status === false) throw new InvalidArgumentException('Learner was not found.');
        if ($mustBeActive && $status !== 'active') {
            throw new InvalidArgumentException('Training cannot be assigned to an inactive learner.');
        }
    }

    private function assertModuleSlug(string $slug): void
    {
        if (preg_match('/^[a-z0-9-]{3,80}$/', $slug) !== 1) {
            throw new InvalidArgumentException('Training module is invalid.');
        }
    }

    private function requiredString(mixed $value, string $label, int $minimum, int $maximum): string
    {
        if (!is_string($value)) throw new InvalidArgumentException("$label is required.");
        $value = preg_replace('/\s+/', ' ', trim($value)) ?? '';
        $length = strlen($value);
        if ($length < $minimum || $length > $maximum) {
            throw new InvalidArgumentException("$label must contain between $minimum and $maximum characters.");
        }
        return $value;
    }

    private function boundedInt(mixed $value, string $label, int $minimum, int $maximum): int
    {
        if (is_string($value) && preg_match('/^-?\d+$/', $value) === 1) $value = (int) $value;
        if (!is_int($value) || $value < $minimum || $value > $maximum) {
            throw new InvalidArgumentException("$label must be between $minimum and $maximum.");
        }
        return $value;
    }

    private function boundedFloat(mixed $value, string $label, float $minimum, float $maximum): float
    {
        if (!is_int($value) && !is_float($value) && !(is_string($value) && is_numeric($value))) {
            throw new InvalidArgumentException("$label must be a number.");
        }
        $value = (float) $value;
        if (!is_finite($value) || $value < $minimum || $value > $maximum) {
            throw new InvalidArgumentException("$label must be between $minimum and $maximum.");
        }
        return $value;
    }

    private function validatePassword(string $password): void
    {
        if (strlen($password) < 12 || strlen($password) > 72
            || preg_match('/[a-z]/', $password) !== 1
            || preg_match('/[A-Z]/', $password) !== 1
            || preg_match('/\d/', $password) !== 1) {
            throw new InvalidArgumentException('Password must be 12-72 characters with uppercase, lowercase, and a number.');
        }
    }

    /** @param array<string, mixed> $details */
    private function audit(int $adminId, string $action, ?int $targetUserId, array $details): void
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO admin_audit_log (actor_user_id, action_code, target_user_id, details)
             VALUES (:actor, :action, :target, :details)'
        );
        $statement->execute([
            'actor' => $adminId,
            'action' => $action,
            'target' => $targetUserId,
            'details' => json_encode($details, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
        ]);
    }
}
