-- Migration: add_discharge_date_to_discharge_report_entries
-- Adds per-row discharge date, separate from report submission date.

ALTER TABLE discharge_report_entries
    ADD COLUMN IF NOT EXISTS discharge_date DATE;

UPDATE discharge_report_entries
SET discharge_date = report_date
WHERE discharge_date IS NULL;

ALTER TABLE discharge_report_entries
    ALTER COLUMN discharge_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS discharge_report_entries_discharge_date_idx
    ON discharge_report_entries(discharge_date);
