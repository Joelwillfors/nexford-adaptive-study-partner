-- ============================================================================
-- Migration 005: Conversational availability rules
-- ============================================================================
-- Persists the "I work all day Wednesday" / "soccer Tuesdays at 13:00" rules
-- the student declares to the function-calling Planner chat. One row per
-- recurring busy window (or one-off date).
--
-- Why a real table instead of a JSONB blob on learner_profiles:
--   - The deterministic planner-agent reads these rules to compute per-day
--     available minutes (B4); the visual layer reads them to draw busy
--     blocks. Two readers, one writer (the chat tool) — a relational table
--     keeps that contract honest.
--   - Idempotency on (user_id, course_id, label, day_of_week, start_min,
--     end_min) so re-mentioning "I have soccer Tuesdays at 1pm" doesn't
--     create duplicate rows. The chat tool relies on this.
--
-- Schema choices:
--   - kind = 'busy_recurring' | 'busy_one_off' — the v1 chat tool only
--     emits 'busy_recurring' (date-parsing layer is out of scope), but the
--     schema is forward-compatible so a future "I'm at a wedding next
--     Saturday" turn doesn't require a migration.
--   - start_min / end_min as integers (0..1440) instead of TIME — keeps
--     arithmetic in the planner-agent in plain JS numbers, which matches
--     how DAY_START_MIN / DAY_END_MIN are already represented in
--     frontend/src/lib/planner/day-schedule.ts.

create table if not exists public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  course_id uuid not null,
  label text not null,
  kind text not null default 'busy_recurring'
    check (kind in ('busy_recurring', 'busy_one_off')),
  day_of_week text
    check (day_of_week in ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')),
  date date,
  start_min int not null check (start_min >= 0 and start_min < 1440),
  end_min int not null check (end_min > start_min and end_min <= 1440),
  source text not null default 'chat',
  created_at timestamptz not null default now()
);

create index if not exists idx_avail_rules_user
  on public.availability_rules (user_id, course_id);

-- Idempotency partial index for the recurring case: re-asserting the same
-- "Work · Wed · 08:00-22:00" rule should be a no-op. The chat tool relies
-- on ON CONFLICT (...) DO NOTHING against this constraint.
create unique index if not exists uq_avail_rules_recurring
  on public.availability_rules (user_id, course_id, label, day_of_week, start_min, end_min)
  where kind = 'busy_recurring';

comment on table public.availability_rules is
  'Conversational busy-window rules declared by students via the Planner chat. Consumed by planner-agent for hour-aware scheduling AND by day-schedule.ts for visual rendering.';
