-- Migration: add_daily_report_templates
-- Stores editable daily report template sections/items.

CREATE TABLE IF NOT EXISTS daily_report_templates (
    id SERIAL PRIMARY KEY,
    template JSONB NOT NULL,
    created_by TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS daily_report_templates_is_active_idx
    ON daily_report_templates(is_active);

-- Ensure only one active template at a time.
CREATE UNIQUE INDEX IF NOT EXISTS daily_report_templates_one_active_idx
    ON daily_report_templates((1))
    WHERE is_active;
