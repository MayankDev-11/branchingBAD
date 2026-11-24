-- RootTrace SQLite schema: 9 tables.
-- Rules enforced here, in the database, not only in the UI (CONTEXT.md):
--   Rule 5: observations are never edited. A bad reading is excluded with a reason.
--   Rule 6: a locked success criterion never changes.

PRAGMA foreign_keys = ON;

-- Raw imported values, untouched. ID = SHA-256 of source + timestamp + type + value,
-- so importing the same file twice adds nothing.
CREATE TABLE IF NOT EXISTS source_records (
    id            TEXT PRIMARY KEY,
    source_id     TEXT NOT NULL,
    source_file   TEXT NOT NULL,
    device        TEXT NOT NULL,
    raw_type      TEXT NOT NULL,
    raw_value     TEXT NOT NULL,
    raw_unit      TEXT,
    recorded_at   TEXT NOT NULL,          -- ISO 8601 with +05:30
    imported_at   TEXT NOT NULL
);

-- Cleaned values in standard units. One row per reading (sl_0001, hd_0031, ...).
CREATE TABLE IF NOT EXISTS observations (
    id                TEXT PRIMARY KEY,
    source_record_id  TEXT NOT NULL REFERENCES source_records(id),
    metric            TEXT NOT NULL,
    value             REAL NOT NULL,
    unit              TEXT NOT NULL,
    date              TEXT NOT NULL,      -- YYYY-MM-DD
    time              TEXT NOT NULL,      -- HH:MM:SS, IST
    device            TEXT NOT NULL,
    source_id         TEXT NOT NULL,
    source_file       TEXT NOT NULL,
    data_quality      REAL NOT NULL CHECK (data_quality BETWEEN 0 AND 1),
    normalization     TEXT NOT NULL,
    is_excluded       INTEGER NOT NULL DEFAULT 0 CHECK (is_excluded IN (0, 1)),
    exclusion_reason  TEXT,
    CHECK (is_excluded = 0 OR exclusion_reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_observations_metric_date ON observations(metric, date);

-- Voice check-ins and typed logs. Scrubbed before any AI call (Mayank's privacy layer).
CREATE TABLE IF NOT EXISTS notes (
    id          TEXT PRIMARY KEY,
    date        TEXT NOT NULL,
    time        TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('voice', 'typed')),
    text        TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

-- Shifts found by change detection. Derived data: recomputed from observations.
CREATE TABLE IF NOT EXISTS change_events (
    id               TEXT PRIMARY KEY,
    metric           TEXT NOT NULL,
    date             TEXT NOT NULL,       -- first day of the new level (PELT)
    detected_on      TEXT NOT NULL,       -- day the 5-of-7 rule fired
    delta            REAL NOT NULL,
    baseline_median  REAL NOT NULL,
    label            TEXT NOT NULL,
    record_ids       TEXT NOT NULL        -- JSON list of observation ids
);

-- One investigation each. The outcome_* columns say what counts as a "bad day"
-- for this question (headache = 1, or sleep under a threshold).
CREATE TABLE IF NOT EXISTS branches (
    id                 TEXT PRIMARY KEY,
    title              TEXT NOT NULL,
    status             TEXT NOT NULL CHECK (status IN ('open', 'concluded', 'inconclusive')),
    branch_type        TEXT NOT NULL DEFAULT 'investigation' CHECK (branch_type IN ('investigation', 'habit')),
    start_date         TEXT NOT NULL,
    end_date           TEXT,
    lane               INTEGER NOT NULL,
    change_event_id    TEXT,
    outcome_metric     TEXT NOT NULL,
    outcome_op         TEXT NOT NULL CHECK (outcome_op IN ('<', '<=', '>', '>=', '==')),
    outcome_threshold  REAL NOT NULL,
    outcome_text       TEXT NOT NULL,     -- "headache days"
    control_text       TEXT NOT NULL      -- "headache-free days"
);

-- Competing explanations. Confidence is never stored: Python computes it from records.
CREATE TABLE IF NOT EXISTS hypotheses (
    id             TEXT PRIMARY KEY,
    branch_id      TEXT NOT NULL REFERENCES branches(id),
    label          TEXT NOT NULL,
    metric         TEXT NOT NULL,
    op             TEXT NOT NULL CHECK (op IN ('<', '<=', '>', '>=', '==')),
    threshold      REAL NOT NULL,
    lag_days       INTEGER NOT NULL DEFAULT 0,  -- exposure read this many days before the outcome day
    exposure_text  TEXT NOT NULL,         -- "caffeine after 4 PM"
    claim_template    TEXT NOT NULL,      -- "{k} of {n} headache days followed nights under 6 hours"
    control_template  TEXT NOT NULL,      -- "{j} of {m} headache-free days also followed nights under 6 hours"
    test           TEXT NOT NULL,
    test_days      INTEGER NOT NULL
);

-- Protocol, locked success criterion, frozen baseline, outcome.
CREATE TABLE IF NOT EXISTS experiments (
    id                  TEXT PRIMARY KEY,
    branch_id           TEXT NOT NULL REFERENCES branches(id),
    hypothesis_id       TEXT NOT NULL REFERENCES hypotheses(id),
    description         TEXT NOT NULL,
    start_date          TEXT NOT NULL,
    duration_days       INTEGER NOT NULL CHECK (duration_days > 0),
    success_criterion   TEXT NOT NULL,    -- the sentence the user agreed to
    criterion           TEXT NOT NULL,    -- the same rule as JSON, evaluated by Python
    adherence_rule      TEXT NOT NULL,    -- JSON: which reading shows the user followed the protocol
    frozen_baseline     TEXT,             -- JSON, frozen at lock time
    locked              INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
    locked_at           TEXT,
    status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'active', 'supported', 'not_supported', 'insufficient_data')),
    outcome             TEXT,             -- JSON, written by Python when the experiment ends
    knowledge_template  TEXT NOT NULL     -- JSON: wording for the lesson; every number comes from Python
);

-- Links an observation to a branch (and hypothesis) as supporting, counterexample or confounder.
CREATE TABLE IF NOT EXISTS evidence (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id       TEXT NOT NULL REFERENCES branches(id),
    hypothesis_id   TEXT REFERENCES hypotheses(id),
    observation_id  TEXT NOT NULL REFERENCES observations(id),
    relation        TEXT NOT NULL CHECK (relation IN ('supporting', 'counterexample', 'confounder')),
    UNIQUE (branch_id, hypothesis_id, observation_id)
);

-- What was learned. Merges back onto the trunk; this is what the Obsidian export writes.
CREATE TABLE IF NOT EXISTS knowledge (
    id              TEXT PRIMARY KEY,
    branch_id       TEXT NOT NULL REFERENCES branches(id),
    experiment_id   TEXT REFERENCES experiments(id),
    date            TEXT NOT NULL,
    statement       TEXT NOT NULL,
    confidence      TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
    record_ids      TEXT NOT NULL DEFAULT '[]',
    invalidated_at  TEXT
);

-- Rule 5: raw records and observations are never edited.
-- The only change allowed on an observation is excluding it (is_excluded + exclusion_reason).
CREATE TRIGGER IF NOT EXISTS source_records_immutable
BEFORE UPDATE ON source_records
BEGIN
    SELECT RAISE(ABORT, 'source records are immutable');
END;

CREATE TRIGGER IF NOT EXISTS observations_immutable
BEFORE UPDATE ON observations
WHEN NEW.id IS NOT OLD.id
  OR NEW.source_record_id IS NOT OLD.source_record_id
  OR NEW.metric IS NOT OLD.metric
  OR NEW.value IS NOT OLD.value
  OR NEW.unit IS NOT OLD.unit
  OR NEW.date IS NOT OLD.date
  OR NEW.time IS NOT OLD.time
  OR NEW.device IS NOT OLD.device
  OR NEW.source_id IS NOT OLD.source_id
  OR NEW.source_file IS NOT OLD.source_file
  OR NEW.data_quality IS NOT OLD.data_quality
  OR NEW.normalization IS NOT OLD.normalization
BEGIN
    SELECT RAISE(ABORT, 'observations are immutable: exclude a bad reading with a reason instead');
END;

-- Rule 6: once locked, the criterion, the protocol and the frozen baseline can never change,
-- and the experiment cannot be unlocked or deleted.
CREATE TRIGGER IF NOT EXISTS lock_criterion
BEFORE UPDATE ON experiments
WHEN OLD.locked = 1 AND (
       NEW.locked IS NOT 1
    OR NEW.locked_at IS NOT OLD.locked_at
    OR NEW.success_criterion IS NOT OLD.success_criterion
    OR NEW.criterion IS NOT OLD.criterion
    OR NEW.adherence_rule IS NOT OLD.adherence_rule
    OR NEW.frozen_baseline IS NOT OLD.frozen_baseline
    OR NEW.hypothesis_id IS NOT OLD.hypothesis_id
    OR NEW.start_date IS NOT OLD.start_date
    OR NEW.duration_days IS NOT OLD.duration_days
)
BEGIN
    SELECT RAISE(ABORT, 'success criterion is locked and can never change');
END;

CREATE TRIGGER IF NOT EXISTS lock_requires_criterion_on_update
BEFORE UPDATE OF locked ON experiments
WHEN NEW.locked = 1 AND (NEW.frozen_baseline IS NULL OR NEW.locked_at IS NULL)
BEGIN
    SELECT RAISE(ABORT, 'an experiment can only be locked with a frozen baseline and a timestamp');
END;

CREATE TRIGGER IF NOT EXISTS lock_requires_criterion_on_insert
BEFORE INSERT ON experiments
WHEN NEW.locked = 1 AND (NEW.frozen_baseline IS NULL OR NEW.locked_at IS NULL)
BEGIN
    SELECT RAISE(ABORT, 'an experiment can only be locked with a frozen baseline and a timestamp');
END;

CREATE TRIGGER IF NOT EXISTS locked_experiment_not_deleted
BEFORE DELETE ON experiments
WHEN OLD.locked = 1
BEGIN
    SELECT RAISE(ABORT, 'a locked experiment cannot be deleted');
END;
