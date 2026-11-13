-- Private account IDs and per-lesson summaries never appear in public JSON.
CREATE TABLE IF NOT EXISTS community_accounts (
 uid TEXT PRIMARY KEY, display_name TEXT NOT NULL, public_id TEXT NOT NULL UNIQUE,
 joined INTEGER NOT NULL DEFAULT 0 CHECK(joined IN (0,1)),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS community_lessons (
 uid TEXT NOT NULL, lesson_id TEXT NOT NULL, received_at INTEGER NOT NULL,
 completed_at INTEGER NOT NULL, score INTEGER NOT NULL, wpm REAL NOT NULL,
 accuracy REAL NOT NULL, chars INTEGER NOT NULL, distinct_keys INTEGER NOT NULL,
 review_status TEXT NOT NULL CHECK(review_status IN ('accepted','pending','rejected')),
 review_reason TEXT, PRIMARY KEY(uid,lesson_id),
 FOREIGN KEY(uid) REFERENCES community_accounts(uid)
);
CREATE INDEX IF NOT EXISTS community_lesson_user ON community_lessons(uid,completed_at DESC);
CREATE TABLE IF NOT EXISTS community_bests (
 uid TEXT PRIMARY KEY, lesson_id TEXT NOT NULL, completed_at INTEGER NOT NULL,
 score INTEGER NOT NULL, wpm REAL NOT NULL, accuracy REAL NOT NULL,
 FOREIGN KEY(uid) REFERENCES community_accounts(uid)
);
CREATE INDEX IF NOT EXISTS community_ranking ON community_bests(score DESC,completed_at DESC);
-- One best qualifying result per user. Public reads additionally enforce
-- rolling14-day expiry and explicit participation, with at most20 rows.
