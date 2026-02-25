-- Migration: scope weekly report answers by area
-- Prevents weekly submissions from overwriting other areas on the same date.

ALTER TABLE report_answers
    ADD COLUMN IF NOT EXISTS area TEXT;

WITH weekly_area_rows AS (
    SELECT
        ra.report_date,
        ra.supervisor_id,
        NULLIF(TRIM(ra.answer), '') AS area
    FROM report_answers ra
    INNER JOIN report_questions rq ON rq.id = ra.question_id
    WHERE rq.report_type = 'weekly'
      AND LOWER(REGEXP_REPLACE(TRIM(rq.question), '\s+', ' ', 'g')) = 'area'
      AND NULLIF(TRIM(ra.answer), '') IS NOT NULL
)
UPDATE report_answers target
SET area = source.area
FROM weekly_area_rows source
WHERE target.report_date = source.report_date
  AND target.supervisor_id = source.supervisor_id
  AND EXISTS (
      SELECT 1
      FROM report_questions target_q
      WHERE target_q.id = target.question_id
        AND target_q.report_type = 'weekly'
  )
  AND (target.area IS NULL OR TRIM(target.area) = '');

UPDATE report_answers
SET area = ''
WHERE area IS NULL;

ALTER TABLE report_answers
    ALTER COLUMN area SET DEFAULT '';

ALTER TABLE report_answers
    ALTER COLUMN area SET NOT NULL;

DROP INDEX IF EXISTS report_answers_question_date_supervisor_key;

CREATE UNIQUE INDEX IF NOT EXISTS report_answers_question_date_supervisor_area_key
    ON report_answers(question_id, report_date, supervisor_id, area);

CREATE INDEX IF NOT EXISTS report_answers_report_date_supervisor_area_idx
    ON report_answers(report_date, supervisor_id, area);
