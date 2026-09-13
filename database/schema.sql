SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS training_versions (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    slug VARCHAR(80) NOT NULL,
    version VARCHAR(20) NOT NULL,
    title VARCHAR(160) NOT NULL,
    summary TEXT NOT NULL,
    mission TEXT NOT NULL,
    duration_seconds SMALLINT UNSIGNED NOT NULL DEFAULT 120,
    max_hazards TINYINT UNSIGNED NOT NULL DEFAULT 8,
    correct_points SMALLINT UNSIGNED NOT NULL DEFAULT 100,
    wrong_penalty SMALLINT UNSIGNED NOT NULL DEFAULT 20,
    scoring_formula_version VARCHAR(30) NOT NULL DEFAULT 'scoring-v1',
    panorama_url VARCHAR(255) NOT NULL,
    panorama_width SMALLINT UNSIGNED NOT NULL DEFAULT 2048,
    initial_yaw DECIMAL(9,6) NOT NULL DEFAULT -1.200000,
    initial_pitch DECIMAL(9,6) NOT NULL DEFAULT 0.050000,
    initial_fov DECIMAL(9,6) NOT NULL DEFAULT 1.570796,
    module_type ENUM('panorama', 'interactive', 'puzzle') NOT NULL DEFAULT 'panorama',
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_training_version (slug, version),
    KEY idx_training_active (slug, is_active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS hazards (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    training_version_id BIGINT UNSIGNED NOT NULL,
    code CHAR(3) NOT NULL,
    title VARCHAR(160) NOT NULL,
    topic VARCHAR(120) NOT NULL,
    yaw DECIMAL(9,6) NOT NULL,
    pitch DECIMAL(9,6) NOT NULL,
    hotspot_size SMALLINT UNSIGNED NOT NULL DEFAULT 52,
    feedback TEXT NOT NULL,
    review_text TEXT NOT NULL,
    content_status ENUM('draft', 'reviewed', 'approved') NOT NULL DEFAULT 'reviewed',
    display_order TINYINT UNSIGNED NOT NULL,
    CONSTRAINT fk_hazard_training FOREIGN KEY (training_version_id) REFERENCES training_versions(id) ON DELETE CASCADE,
    UNIQUE KEY uq_hazard_code (training_version_id, code),
    UNIQUE KEY uq_hazard_order (training_version_id, display_order)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quiz_questions (
    id BIGINT UNSIGNED PRIMARY KEY,
    training_version_id BIGINT UNSIGNED NOT NULL,
    code CHAR(3) NOT NULL,
    prompt TEXT NOT NULL,
    explanation TEXT NOT NULL,
    content_status ENUM('draft', 'reviewed', 'approved') NOT NULL DEFAULT 'reviewed',
    display_order TINYINT UNSIGNED NOT NULL,
    CONSTRAINT fk_question_training FOREIGN KEY (training_version_id) REFERENCES training_versions(id) ON DELETE CASCADE,
    UNIQUE KEY uq_question_code (training_version_id, code),
    UNIQUE KEY uq_question_order (training_version_id, display_order)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quiz_options (
    id BIGINT UNSIGNED PRIMARY KEY,
    question_id BIGINT UNSIGNED NOT NULL,
    label VARCHAR(255) NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    display_order TINYINT UNSIGNED NOT NULL,
    CONSTRAINT fk_option_question FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE,
    UNIQUE KEY uq_option_order (question_id, display_order)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    display_name VARCHAR(80) NOT NULL,
    email VARCHAR(190) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    total_xp INT UNSIGNED NOT NULL DEFAULT 0,
    user_level VARCHAR(30) NOT NULL DEFAULT 'Rookie',
    login_streak SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    last_activity_date DATE NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP NULL DEFAULT NULL,
    UNIQUE KEY uq_user_email (email),
    KEY idx_user_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_badges (
    user_id BIGINT UNSIGNED NOT NULL,
    badge_code VARCHAR(50) NOT NULL,
    awarded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, badge_code),
    CONSTRAINT fk_user_badge_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    KEY idx_user_badge_awarded (awarded_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attempts (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NULL,
    training_version_id BIGINT UNSIGNED NOT NULL,
    found_count TINYINT UNSIGNED NOT NULL,
    wrong_clicks SMALLINT UNSIGNED NOT NULL,
    challenge_score SMALLINT UNSIGNED NOT NULL,
    quiz_score TINYINT UNSIGNED NOT NULL,
    elapsed_seconds SMALLINT UNSIGNED NOT NULL,
    overall_percent TINYINT UNSIGNED NOT NULL,
    rating ENUM('Bronze', 'Silver', 'Gold') NOT NULL,
    scoring_formula_version VARCHAR(30) NOT NULL,
    xp_earned INT UNSIGNED NOT NULL DEFAULT 0,
    completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_attempt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_attempt_training FOREIGN KEY (training_version_id) REFERENCES training_versions(id),
    KEY idx_attempt_user_completed (user_id, completed_at),
    KEY idx_attempt_completed (completed_at),
    KEY idx_attempt_rating (rating)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS challenge_attempts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  challenge_code CHAR(8) NOT NULL,
  challenger_id BIGINT UNSIGNED NOT NULL,
  opponent_id BIGINT UNSIGNED NULL,
  training_version_id BIGINT UNSIGNED NOT NULL,
  challenger_attempt_id BIGINT UNSIGNED NULL,
  opponent_attempt_id BIGINT UNSIGNED NULL,
  status ENUM('pending', 'accepted', 'completed') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_challenge_code (challenge_code),
  CONSTRAINT fk_ca_challenger FOREIGN KEY (challenger_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ca_opponent FOREIGN KEY (opponent_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ca_training FOREIGN KEY (training_version_id) REFERENCES training_versions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Insert module 1 (Warehouse Hazard Hunt)
INSERT INTO training_versions
    (id, slug, version, title, summary, mission, duration_seconds, max_hazards, correct_points, wrong_penalty, scoring_formula_version, panorama_url, panorama_width, initial_yaw, initial_pitch, initial_fov, module_type, is_active)
VALUES
    (1, 'warehouse-hazard-hunt', '1.0.0', 'Warehouse Hazard Hunt',
     'A focused 360-degree hazard-perception activity for an automotive logistics warehouse.',
     'Inspect the warehouse carefully and identify all 8 health and safety hazards before the 2-minute timer ends. Select only genuine hazards: correct findings earn points and incorrect selections reduce the challenge score.',
     120, 8, 100, 20, 'scoring-v1', '/assets/panorama/warehouse-360-v3.png', 1774, -1.200000, -0.020000, 2.042035, 'panorama', TRUE)
ON DUPLICATE KEY UPDATE
    title=VALUES(title), summary=VALUES(summary), mission=VALUES(mission),
    panorama_url=VALUES(panorama_url), panorama_width=VALUES(panorama_width),
    initial_yaw=VALUES(initial_yaw), initial_pitch=VALUES(initial_pitch), initial_fov=VALUES(initial_fov),
    module_type=VALUES(module_type), is_active=VALUES(is_active);

-- Insert new modules (placeholders to exist in DB, detailed data is in fallbacks)
INSERT INTO training_versions
    (id, slug, version, title, summary, mission, duration_seconds, max_hazards, module_type, is_active, panorama_url)
VALUES
    (2, 'manual-handling', '1.0.0', 'Manual Handling', 'Safe lifting and carrying techniques.', 'Identify poor manual handling practices.', 120, 4, 'panorama', TRUE, '/assets/panorama/manual-handling-360-v2.png'),
    (3, 'working-at-height', '1.0.0', 'Working at Height', 'Safety principles for working above ground.', 'Identify unsafe working at height practices.', 120, 4, 'panorama', TRUE, '/assets/panorama/working-at-height-360-v2.png'),
    (4, 'five-whys', '1.0.0', '5 Whys — Root Cause', 'Root cause analysis puzzle.', 'Drill through causation layers.', 300, 0, 'puzzle', TRUE, ''),
    (5, 'unsafe-acts', '1.0.0', 'Unsafe Acts', 'Identifying behavioral risks.', 'Identify unsafe acts.', 120, 4, 'panorama', TRUE, '/assets/panorama/unsafe-acts-360-v2.png'),
    (6, 'cyber-awareness', '1.0.0', 'Cyber Awareness', '5 interactive cyber mini-games.', 'Complete the cyber challenges.', 480, 0, 'interactive', TRUE, '')
ON DUPLICATE KEY UPDATE title=VALUES(title), summary=VALUES(summary), mission=VALUES(mission),
    duration_seconds=VALUES(duration_seconds), max_hazards=VALUES(max_hazards),
    module_type=VALUES(module_type), panorama_url=VALUES(panorama_url), is_active=VALUES(is_active);

-- Manual Handling camera profile v3: corrected v2 panorama and wider initial overview.
-- Rollback asset/FOV: manual-handling-360-v1.png / 1.954769.
UPDATE training_versions
SET panorama_url = '/assets/panorama/manual-handling-360-v2.png',
    initial_yaw = -0.380000, initial_pitch = -0.130000, initial_fov = 2.042035, panorama_width = 1774
WHERE slug = 'manual-handling' AND is_active = TRUE;

-- Wide panorama profiles: regenerated scenes with the same overview as Manual Handling.
-- Rollback assets remain: warehouse v2, working-at-height v1, unsafe-acts v1.
UPDATE training_versions
SET panorama_url = '/assets/panorama/warehouse-360-v3.png',
    initial_yaw = -1.200000, initial_pitch = -0.020000, initial_fov = 2.042035, panorama_width = 1774
WHERE slug = 'warehouse-hazard-hunt' AND is_active = TRUE;

UPDATE training_versions
SET panorama_url = '/assets/panorama/working-at-height-360-v2.png',
    initial_yaw = 1.870000, initial_pitch = 0.470000, initial_fov = 2.042035, panorama_width = 1774
WHERE slug = 'working-at-height' AND is_active = TRUE;

UPDATE training_versions
SET panorama_url = '/assets/panorama/unsafe-acts-360-v2.png',
    initial_yaw = 2.500000, initial_pitch = 0.190000, initial_fov = 2.042035, panorama_width = 1774
WHERE slug = 'unsafe-acts' AND is_active = TRUE;

INSERT INTO hazards
    (id, training_version_id, code, title, topic, yaw, pitch, hotspot_size, feedback, review_text, content_status, display_order)
VALUES
    (1, 1, 'H1', 'Forklift and pedestrian conflict', 'Hazard Perception', -2.220000, -0.130000, 58, 'Correct +100. A pedestrian is too close to the forklift operating area. The safer arrangement is to keep pedestrians within designated routes and maintain separation from moving vehicles.', 'Vehicle and pedestrian routes should be separated, clearly marked, and followed.', 'reviewed', 1),
    (2, 1, 'H2', 'Liquid spill on floor', 'Hazard Perception / Housekeeping', -1.370000, -0.410000, 54, 'Correct +100. The liquid spill creates a slip hazard. The area should be made safe, reported and cleaned in line with site procedure.', 'Isolate and report spills, then use the approved safe cleaning procedure.', 'reviewed', 2),
    (3, 1, 'H3', 'Incorrect manual lifting', 'Manual Handling', -0.380000, -0.130000, 58, 'Correct +100. The lifting posture and load handling are unsafe. The worker should assess the load and use the client-approved safe handling method or suitable assistance/equipment.', 'Assess the load before lifting and use an approved technique, assistance, or handling equipment.', 'reviewed', 3),
    (4, 1, 'H4', 'Missing required PPE', 'Unsafe Acts', 0.490000, 0.050000, 54, 'Correct +100. The worker is not using the required protective equipment for the illustrated work area. Exact PPE must follow the client''s site rules.', 'Use the PPE required by the client''s confirmed task and area rules.', 'reviewed', 4),
    (5, 1, 'H5', 'Blocked emergency exit', 'Hazard Perception', 1.240000, 0.080000, 58, 'Correct +100. Stored materials are obstructing an emergency escape route. Emergency routes should remain clear and accessible.', 'Never store materials where they obstruct an emergency exit or escape route.', 'reviewed', 5),
    (6, 1, 'H6', 'Unsafe ladder / work at height', 'Working at Height', 1.870000, 0.470000, 58, 'Correct +100. The ladder/work-at-height setup is unsafe. Working at height should use suitable equipment and follow the client''s approved procedure.', 'Use suitable work-at-height equipment and the client''s approved procedure.', 'reviewed', 6),
    (7, 1, 'H7', 'Unstable pallet / stacked load', 'Unsafe Acts / Storage', 2.500000, 0.190000, 58, 'Correct +100. The stacked load appears unstable and could fall. Loads should be stored securely and within the site''s safe storage rules.', 'Stack and secure loads so they remain stable and within safe storage limits.', 'reviewed', 7),
    (8, 1, 'H8', 'Obstructed pedestrian walkway', 'Hazard Perception', 1.920000, -0.690000, 54, 'Correct +100. The pedestrian walkway is obstructed. Keeping designated routes clear reduces trip risk and keeps people away from operational traffic.', 'Keep designated pedestrian routes clear of boxes, tools, and other materials.', 'reviewed', 8)
ON DUPLICATE KEY UPDATE title=VALUES(title), topic=VALUES(topic), yaw=VALUES(yaw), pitch=VALUES(pitch), feedback=VALUES(feedback), review_text=VALUES(review_text);

INSERT INTO quiz_questions (id, training_version_id, code, prompt, explanation, content_status, display_order) VALUES
    (1, 1, 'Q1', 'What is the safest principle when pedestrians and forklifts operate in the same warehouse?', 'Pedestrians and moving vehicles should use separated, clearly marked routes wherever reasonably practicable.', 'reviewed', 1),
    (2, 1, 'Q2', 'What should happen first when a liquid spill is found in a busy walkway?', 'The immediate priority is to prevent exposure to the slip risk, then report and clean it using the site procedure.', 'reviewed', 2),
    (3, 1, 'Q3', 'Before lifting a heavy component box manually, what should a worker do?', 'The load and route should be assessed first so the worker can choose a safe method, assistance, or handling equipment.', 'reviewed', 3),
    (4, 1, 'Q4', 'Which statement about emergency exits is correct?', 'Emergency exits and their access routes must remain clear and available.', 'reviewed', 4),
    (5, 1, 'Q5', 'What is the safest response to an unstable stacked pallet?', 'The area should be kept safe and the load corrected using the approved storage and handling procedure.', 'reviewed', 5)
ON DUPLICATE KEY UPDATE prompt=VALUES(prompt), explanation=VALUES(explanation);

INSERT INTO quiz_options (id, question_id, label, is_correct, display_order) VALUES
    (101, 1, 'Keep pedestrians in designated routes separated from vehicle movement.', TRUE, 1),
    (102, 1, 'Let pedestrians choose the shortest route through vehicle areas.', FALSE, 2),
    (103, 1, 'Rely only on the forklift horn.', FALSE, 3),
    (104, 1, 'Allow close passing when the forklift is moving slowly.', FALSE, 4),
    (201, 2, 'Walk around it and leave it for the next shift.', FALSE, 1),
    (202, 2, 'Make the area safe, report it, and follow the approved cleaning procedure.', TRUE, 2),
    (203, 2, 'Cover it with cardboard.', FALSE, 3),
    (204, 2, 'Ignore it if it is a small spill.', FALSE, 4),
    (301, 3, 'Lift immediately before the route becomes busy.', FALSE, 1),
    (302, 3, 'Twist while lifting to save time.', FALSE, 2),
    (303, 3, 'Assess the load and use a safe method, help, or suitable equipment.', TRUE, 3),
    (304, 3, 'Test the weight by jerking the box upward.', FALSE, 4),
    (401, 4, 'They may be used for temporary storage during a busy period.', FALSE, 1),
    (402, 4, 'They only need to be clear during an evacuation drill.', FALSE, 2),
    (403, 4, 'They must remain clear and accessible.', TRUE, 3),
    (404, 4, 'Small boxes may be placed there if they are visible.', FALSE, 4),
    (501, 5, 'Climb the stack and push the load into place.', FALSE, 1),
    (502, 5, 'Keep the area safe and correct the load using the approved procedure.', TRUE, 2),
    (503, 5, 'Remove the lowest item by hand.', FALSE, 3),
    (504, 5, 'Leave it until the pallet is required.', FALSE, 4)
ON DUPLICATE KEY UPDATE label=VALUES(label), is_correct=VALUES(is_correct), display_order=VALUES(display_order);
