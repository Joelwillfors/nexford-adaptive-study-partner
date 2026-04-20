-- ============================================================================
-- Migration 003: Mode switching + structured quiz metadata
-- ============================================================================
-- Adds a flexible jsonb `metadata` field to chat_logs so we can persist:
--   - mode ("socratic" | "direct") for every mentor turn
--   - structured quiz/recap payloads
--   - quiz response records (concept_tag, selected_index, correct, confidence)
-- Without this, the Profiler can't distinguish checkpoint quizzes from
-- freeform student questions, and mode switching has no history to read.

alter table public.chat_logs
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_chat_logs_metadata_gin
  on public.chat_logs using gin (metadata);

comment on column public.chat_logs.metadata is
  'Flexible per-turn metadata: mode, structured assistant message payload, quiz response records.';
