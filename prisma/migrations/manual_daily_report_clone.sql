-- Migration: add_daily_report_submissions
-- Stores cloned daily Google Form submissions from supervisors

CREATE TABLE IF NOT EXISTS daily_report_submissions (
    id SERIAL PRIMARY KEY,
    report_date DATE NOT NULL,
    supervisor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    supervisor_name TEXT NOT NULL,
    region TEXT NOT NULL,
    round_number TEXT NOT NULL,
    checklist_answers JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_report_submissions_unique_submission
    ON daily_report_submissions(report_date, supervisor_id, round_number);

CREATE INDEX IF NOT EXISTS daily_report_submissions_report_date_idx
    ON daily_report_submissions(report_date);

CREATE INDEX IF NOT EXISTS daily_report_submissions_supervisor_id_idx
    ON daily_report_submissions(supervisor_id);
