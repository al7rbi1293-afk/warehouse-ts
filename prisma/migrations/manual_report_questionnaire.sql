-- Migration: add_report_questionnaire
-- Creates manager-configurable report questions and supervisor answers

CREATE TABLE IF NOT EXISTS report_questions (
    id SERIAL PRIMARY KEY,
    report_type TEXT NOT NULL,
    question TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS report_questions_report_type_sort_order_idx
    ON report_questions(report_type, sort_order);

CREATE TABLE IF NOT EXISTS report_answers (
    id SERIAL PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES report_questions(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    answer TEXT NOT NULL,
    supervisor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    supervisor_name TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS report_answers_question_date_supervisor_key
    ON report_answers(question_id, report_date, supervisor_id);

CREATE INDEX IF NOT EXISTS report_answers_report_date_idx
    ON report_answers(report_date);

CREATE INDEX IF NOT EXISTS report_answers_supervisor_id_idx
    ON report_answers(supervisor_id);
