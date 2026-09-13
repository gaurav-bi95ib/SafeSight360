<?php

declare(strict_types=1);

namespace SafeSight360;

use InvalidArgumentException;

final class AttemptService
{
    public function __construct(private TrainingRepository $repository)
    {
    }

    /** @param array<string, mixed> $payload
     *  @return array<string, mixed>
     */
    public function complete(array $payload, int $userId): array
    {
        $slug = $payload['moduleSlug'] ?? 'warehouse-hazard-hunt';
        if (!is_string($slug) || preg_match('/^[a-z0-9-]{3,80}$/', $slug) !== 1) {
            throw new InvalidArgumentException('The module identifier is invalid.');
        }
        $facts = $this->repository->getScoringFacts($slug);
        
        $submittedCodes = $this->validatedHazardCodes($payload['hazardCodes'] ?? []);
        $knownCodes = array_values(array_unique($facts['hazardCodes']));
        $foundCodes = array_values(array_intersect($knownCodes, $submittedCodes));

        $wrongClicks = $this->boundedInteger($payload['wrongClicks'] ?? null, 0, 999, 'wrongClicks');
        $elapsedSeconds = $this->boundedInteger(
            $payload['elapsedSeconds'] ?? null,
            0,
            (int) $facts['durationSeconds'],
            'elapsedSeconds'
        );
        
        $quizAnswers = $this->validatedQuizAnswers($payload['quizAnswers'] ?? []);

        // We only enforce strict counts if the DB says this module has hazards and questions
        // For new modules like 5 Whys, maxHazards is 0.
        $maxHazards = (int) $facts['maxHazards'];
        $numQuestions = count($facts['correctAnswers']);
        
        $quizScore = 0;
        foreach ($facts['correctAnswers'] as $questionId => $correctOptionId) {
            if (($quizAnswers[(int) $questionId] ?? null) === $correctOptionId) {
                $quizScore++;
            }
        }

        $foundCount = count($foundCodes);
        $challengeScore = max(
            0,
            ($foundCount * (int) $facts['correctPoints']) - ($wrongClicks * (int) $facts['wrongPenalty'])
        );
        
        $quizTotal = $numQuestions;
        $badgeSignals = [];

        // Panorama scores are recalculated from canonical hazards and answers.
        // Puzzle/interactive scores are recalculated from bounded activity evidence.
        if ($maxHazards > 0 && $numQuestions > 0) {
            $overallPercent = (int) round(
                70 * ($foundCount / $maxHazards)
                + 30 * ($quizScore / $numQuestions)
            );
        } else {
            [$overallPercent, $quizScore, $quizTotal, $badgeSignals] = $this->validatedInteractiveResult(
                $slug,
                $payload['interactiveEvidence'] ?? null
            );
        }

        $rating = self::rating($overallPercent);
        
        // Calculate XP
        $xpEarned = $overallPercent * 10;
        if ($rating === 'Gold') $xpEarned += 100;

        $result = [
            'userId' => $userId,
            'trainingId' => (int) $facts['trainingId'],
            'foundCodes' => $foundCodes,
            'missedCodes' => array_values(array_diff($knownCodes, $foundCodes)),
            'foundCount' => $foundCount,
            'wrongClicks' => $wrongClicks,
            'challengeScore' => $challengeScore,
            'quizScore' => $quizScore,
            'quizTotal' => $quizTotal,
            'elapsedSeconds' => $elapsedSeconds,
            'overallPercent' => $overallPercent,
            'rating' => $rating,
            'scoringFormulaVersion' => $facts['scoringFormulaVersion'],
            'xpEarned' => $xpEarned,
            'maxHazards' => $maxHazards,
            'durationSeconds' => (int) $facts['durationSeconds'],
            'moduleSlug' => $slug,
            'badgeSignals' => $badgeSignals,
        ];

        if (isset($payload['challengeCode']) && is_string($payload['challengeCode'])) {
            $this->repository->validateChallengeSubmission($payload['challengeCode'], $userId, (int) $facts['trainingId']);
        }
        $result['attemptId'] = $this->repository->recordAttempt($result);
        if (isset($payload['challengeCode']) && is_string($payload['challengeCode'])) {
            $result['challenge'] = $this->repository->attachChallengeAttempt(
                $payload['challengeCode'], $userId, $result['attemptId']
            );
        }
        return $result;
    }

    public static function rating(int $overallPercent): string
    {
        if ($overallPercent >= 80) {
            return 'Gold';
        }
        if ($overallPercent >= 60) {
            return 'Silver';
        }
        return 'Bronze';
    }

    /** @return list<string> */
    private function validatedHazardCodes(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }
        $codes = [];
        foreach ($value as $code) {
            if (!is_string($code)) continue;
            $codes[] = $code;
        }
        return array_values(array_unique($codes));
    }

    /** @return array<int, int> */
    private function validatedQuizAnswers(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }
        $answers = [];
        foreach ($value as $questionId => $optionId) {
            if (!is_numeric($questionId) || !is_int($optionId) || $optionId < 1) {
                continue;
            }
            $answers[(int) $questionId] = $optionId;
        }
        return $answers;
    }

    private function boundedInteger(mixed $value, int $minimum, int $maximum, string $field): int
    {
        if (!is_int($value) || $value < $minimum || $value > $maximum) {
            return $minimum; // fail soft for dynamic modules
        }
        return $value;
    }

    /** @return array{0: int, 1: int, 2: int, 3: list<string>} */
    private function validatedInteractiveResult(string $slug, mixed $evidence): array
    {
        if (!is_array($evidence)) {
            throw new InvalidArgumentException('Activity evidence is required to save this result.');
        }

        if ($slug === 'five-whys') {
            $answers = $evidence['answers'] ?? null;
            $correctAnswers = ['a', 'b', 'c', 'a', 'd'];
            if (!is_array($answers) || count($answers) !== count($correctAnswers)) {
                throw new InvalidArgumentException('The 5 Whys answer evidence is incomplete.');
            }
            $correct = 0;
            foreach ($correctAnswers as $index => $expected) {
                $answer = $answers[$index] ?? null;
                if (!is_string($answer) || preg_match('/^[a-d]$/', $answer) !== 1) {
                    throw new InvalidArgumentException('The 5 Whys answer evidence is invalid.');
                }
                if ($answer === $expected) {
                    $correct++;
                }
            }
            return [
                $correct * 20,
                $correct,
                count($correctAnswers),
                $correct === count($correctAnswers) ? ['root_cause'] : [],
            ];
        }

        if ($slug === 'cyber-awareness') {
            $answers = $evidence['answers'] ?? null;
            if (!is_array($answers) || count($answers) !== 5) {
                throw new InvalidArgumentException('Cyber activity evidence is incomplete.');
            }

            $fundamentals = $this->validatedBooleanAnswers($answers['fundamentals'] ?? null, 3);
            $homeWorking = $this->validatedChoiceSet($answers['home-working'] ?? null, ['h1', 'h2', 'h3', 'h4']);
            $socialEngineering = $this->validatedChoiceSet(
                $answers['social-engineering'] ?? null,
                ['fake-sender', 'urgent', 'fake-link']
            );
            $mobile = $this->validatedChoiceSet($answers['mobile'] ?? null, ['m1', 'm2', 'm3', 'm4']);
            $phishing = $this->validatedStringAnswers($answers['phishing'] ?? null, 3, ['safe', 'suspect', 'danger']);

            $topicScores = [
                (int) round(100 * $this->matchingCount($fundamentals, [false, true, false]) / 3),
                $this->selectionScore($homeWorking, ['h1', 'h4'], ['h2', 'h3']),
                count($socialEngineering) === 3 ? 100 : 0,
                $this->selectionScore($mobile, ['m1', 'm3'], ['m2', 'm4']),
                (int) round(100 * (
                    ($phishing[0] === 'safe' ? 1 : 0)
                    + (in_array($phishing[1], ['suspect', 'danger'], true) ? 1 : 0)
                    + (in_array($phishing[2], ['suspect', 'danger'], true) ? 1 : 0)
                ) / 3),
            ];
            $overall = (int) round(array_sum($topicScores) / count($topicScores));
            $allTopicsPassed = min($topicScores) >= 80;
            return [$overall, $overall, 100, $allTopicsPassed ? ['cyber_guardian'] : []];
        }

        throw new InvalidArgumentException('This activity type cannot be scored.');
    }

    /** @return list<bool> */
    private function validatedBooleanAnswers(mixed $value, int $count): array
    {
        if (!is_array($value) || count($value) !== $count) {
            throw new InvalidArgumentException('Cyber activity evidence is incomplete.');
        }
        foreach ($value as $answer) {
            if (!is_bool($answer)) throw new InvalidArgumentException('Cyber activity evidence is invalid.');
        }
        return array_values($value);
    }

    /** @param list<string> $allowed @return list<string> */
    private function validatedChoiceSet(mixed $value, array $allowed): array
    {
        if (!is_array($value)) throw new InvalidArgumentException('Cyber activity evidence is incomplete.');
        $choices = array_values(array_unique($value));
        foreach ($choices as $choice) {
            if (!is_string($choice) || !in_array($choice, $allowed, true)) {
                throw new InvalidArgumentException('Cyber activity evidence is invalid.');
            }
        }
        return $choices;
    }

    /** @param list<string> $allowed @return list<string> */
    private function validatedStringAnswers(mixed $value, int $count, array $allowed): array
    {
        if (!is_array($value) || count($value) !== $count) {
            throw new InvalidArgumentException('Cyber activity evidence is incomplete.');
        }
        foreach ($value as $answer) {
            if (!is_string($answer) || !in_array($answer, $allowed, true)) {
                throw new InvalidArgumentException('Cyber activity evidence is invalid.');
            }
        }
        return array_values($value);
    }

    /** @param list<mixed> $actual @param list<mixed> $expected */
    private function matchingCount(array $actual, array $expected): int
    {
        $matches = 0;
        foreach ($expected as $index => $answer) {
            if (($actual[$index] ?? null) === $answer) $matches++;
        }
        return $matches;
    }

    /** @param list<string> $selected @param list<string> $correct @param list<string> $incorrect */
    private function selectionScore(array $selected, array $correct, array $incorrect): int
    {
        $points = count(array_intersect($selected, $correct)) - count(array_intersect($selected, $incorrect));
        return max(0, (int) round(100 * $points / count($correct)));
    }
}
