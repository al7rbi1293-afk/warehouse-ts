-- Migration: add_multizone_substitute_fields
-- Add new columns to users table for multi-zone and attendance shift support
ALTER TABLE users
ADD COLUMN IF NOT EXISTS regions TEXT;
ALTER TABLE users
ADD COLUMN IF NOT EXISTS attendance_shift_id INTEGER REFERENCES shifts(id);
-- Add substitute_active column to staff_attendance table
ALTER TABLE staff_attendance
ADD COLUMN IF NOT EXISTS substitute_active BOOLEAN DEFAULT FALSE;
-- Add comment for documentation
COMMENT ON COLUMN users.regions IS 'Comma-separated list of assigned zones for multi-zone support';
COMMENT ON COLUMN users.attendance_shift_id IS 'Attendance shift if different from primary shift';
COMMENT ON COLUMN staff_attendance.substitute_active IS 'Flag indicating if substitute is currently active';