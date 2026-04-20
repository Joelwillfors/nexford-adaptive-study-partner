-- ============================================================================
-- Migration 004: Canvas Gradebook export ledger
-- ============================================================================
-- Persists every "Send Review / Export to Gradebook" intervention the
-- teacher fires from the Class Intelligence dashboard. Today the row is
-- written by MockCanvasProvider; tomorrow CanvasProvider writes the same
-- row AND PUTs an LTI assignment grade against the real Canvas API.
--
-- The table is intentionally an append-only ledger:
--   - (course_id, student_id, concept_tag, exported_for_day) is unique,
--     so re-clicking the button on the same day is a no-op (idempotent).
--   - Different days produce new rows so the teacher can see how many
--     times a student has been nudged on a concept this term.
--
-- During the demo we `SELECT * FROM gradebook_exports` to prove the
-- click actually wrote a row, not just lit a toast.

create table if not exists public.gradebook_exports (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null,
  student_id text not null,
  concept_tag text not null,
  exported_for_day date not null default current_date,
  intervention_kind text not null default 'review_nudge',
  exported_by text,
  payload jsonb not null default '{}'::jsonb,
  provider text not null default 'mock_canvas',
  created_at timestamptz not null default now(),
  unique (course_id, student_id, concept_tag, exported_for_day)
);

create index if not exists idx_gradebook_exports_course_day
  on public.gradebook_exports (course_id, exported_for_day desc);

create index if not exists idx_gradebook_exports_student
  on public.gradebook_exports (student_id, created_at desc);

comment on table public.gradebook_exports is
  'Append-only ledger of teacher-fired interventions exported to the LMS gradebook. Idempotent per (course, student, concept, day).';
