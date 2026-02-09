-- Migration: add_discharge_report_entries
-- Stores row-based discharge report entries submitted by supervisors

CREATE TABLE IF NOT EXISTS discharge_report_entries (
    id SERIAL PRIMARY KEY,
    report_date DATE NOT NULL,
    supervisor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    supervisor_name TEXT NOT NULL,
    area TEXT NOT NULL,
    room_number TEXT NOT NULL,
    room_type TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS discharge_report_entries_report_date_idx
    ON discharge_report_entries(report_date);

CREATE INDEX IF NOT EXISTS discharge_report_entries_supervisor_id_idx
    ON discharge_report_entries(supervisor_id);

CREATE INDEX IF NOT EXISTS discharge_report_entries_report_date_supervisor_id_idx
    ON discharge_report_entries(report_date, supervisor_id);
