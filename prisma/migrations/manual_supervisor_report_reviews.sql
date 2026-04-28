CREATE TABLE IF NOT EXISTS report_reviews (
    id SERIAL PRIMARY KEY,
    report_type TEXT NOT NULL,
    report_date DATE NOT NULL,
    supervisor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    supervisor_name TEXT NOT NULL,
    area TEXT NOT NULL DEFAULT '',
    round_number TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Submitted',
    correction_count INTEGER NOT NULL DEFAULT 0,
    resubmission_count INTEGER NOT NULL DEFAULT 0,
    first_submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMP NULL,
    reviewed_by TEXT NULL,
    review_notes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS report_reviews_scope_key
    ON report_reviews(report_type, report_date, supervisor_id, area, round_number);

CREATE INDEX IF NOT EXISTS report_reviews_type_status_idx
    ON report_reviews(report_type, status);

CREATE INDEX IF NOT EXISTS report_reviews_supervisor_date_idx
    ON report_reviews(supervisor_id, report_date);

CREATE INDEX IF NOT EXISTS report_reviews_type_date_idx
    ON report_reviews(report_type, report_date);
