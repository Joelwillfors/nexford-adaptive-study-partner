-- ============================================================================
-- Nexford Socratic Evaluator — Foundation Schema
-- Migration 001: Core tables for RAG pipeline, chat, and learner profiling
--
-- Mirrors the AlphaDesk pattern:
--   scrape_tasks  →  grading_tasks (async lifecycle)
--   listing_runs  →  learner_profiles (canonical state per learner)
--   (new)         →  document_embeddings (pgvector RAG)
--   (new)         →  chat_logs (Socratic interaction history)
-- ============================================================================

-- ── Extensions ──────────────────────────────────────────────────────────────

create extension if not exists "pgvector" with schema public;
create extension if not exists "uuid-ossp" with schema public;


-- ============================================================================
-- 1. COURSES — container for uploaded material
-- ============================================================================

create table public.courses (
  id            uuid primary key default uuid_generate_v4(),
  title         text not null,
  description   text,
  created_by    uuid,                       -- teacher user id (Supabase Auth)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.courses is
  'A course container. Teachers upload material into a course; students interact within one.';


-- ============================================================================
-- 2. DOCUMENT_EMBEDDINGS — RAG vector store (pgvector)
-- ============================================================================
-- Each row is one chunk of a source document, with its embedding.
-- The embedding model (e.g. text-embedding-3-small) produces 1536-dim vectors.

create table public.document_embeddings (
  id            uuid primary key default uuid_generate_v4(),
  course_id     uuid not null references public.courses(id) on delete cascade,

  -- Source provenance
  source_file   text not null,              -- original filename ("marketing_101.pdf")
  source_type   text not null default 'pdf',-- pdf | docx | text | url
  chunk_index   int  not null,              -- 0-based order within document

  -- Content
  content       text not null,              -- the raw text chunk
  metadata      jsonb not null default '{}',-- page number, section heading, etc.

  -- Vector (OpenAI text-embedding-3-small = 1536 dims)
  embedding     vector(1536) not null,

  -- Lifecycle
  created_at    timestamptz not null default now()
);

create index idx_document_embeddings_course
  on public.document_embeddings(course_id);

-- HNSW index for fast approximate nearest-neighbour search
create index idx_document_embeddings_vector
  on public.document_embeddings
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

comment on table public.document_embeddings is
  'Chunked course material with vector embeddings for semantic retrieval (RAG).';


-- ============================================================================
-- 3. LEARNER_PROFILES — knowledge graph / competency state per student
-- ============================================================================
-- Analogous to AlphaDesk's `listing_runs`: the canonical, upserted state row.
-- The hidden Profiler Agent writes here after every interaction.

create table public.learner_profiles (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null,            -- Supabase Auth user
  course_id       uuid not null references public.courses(id) on delete cascade,

  -- Knowledge graph (JSONB for flexible competency nodes)
  -- Shape: { "concepts": { "cac": { "level": "weak", "attempts": 3, "last_seen": "..." }, ... } }
  knowledge_graph jsonb not null default '{"concepts": {}}',

  -- Aggregate signals for the teacher digest
  overall_level   text not null default 'unknown',  -- strong | moderate | weak | unknown
  total_sessions  int  not null default 0,
  last_active_at  timestamptz,

  -- Profiler agent metadata
  profiler_version text,                    -- tracks which prompt version generated this
  profiler_notes   text,                    -- free-text from the profiler for debugging

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint uq_learner_course unique (user_id, course_id)
);

create index idx_learner_profiles_course
  on public.learner_profiles(course_id);

create index idx_learner_profiles_user
  on public.learner_profiles(user_id);

-- GIN index on knowledge_graph for efficient JSONB queries in the digest
create index idx_learner_profiles_kg
  on public.learner_profiles using gin (knowledge_graph);

comment on table public.learner_profiles is
  'Per-learner, per-course competency state. Upserted by the Profiler Agent after each interaction.';


-- ============================================================================
-- 4. CHAT_LOGS — full Socratic interaction history
-- ============================================================================
-- Every message (student question + mentor response) is logged.
-- The Profiler Agent reads recent chat_logs to update learner_profiles.

create table public.chat_logs (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null,
  course_id       uuid not null references public.courses(id) on delete cascade,

  -- Conversation threading
  session_id      uuid not null,            -- groups a continuous conversation

  -- Message content
  role            text not null check (role in ('student', 'mentor', 'system')),
  content         text not null,

  -- RAG provenance: which chunks were retrieved for this response
  retrieved_chunks uuid[] default '{}',     -- references document_embeddings.id

  -- Agent metadata
  model_used      text,                     -- e.g. "gpt-4o", "claude-sonnet-4-20250514"
  token_usage     jsonb,                    -- { "input": N, "output": N, "total": N }
  latency_ms      int,

  created_at      timestamptz not null default now()
);

create index idx_chat_logs_user_course
  on public.chat_logs(user_id, course_id);

create index idx_chat_logs_session
  on public.chat_logs(session_id);

create index idx_chat_logs_created
  on public.chat_logs(created_at desc);

comment on table public.chat_logs is
  'Append-only log of every Socratic interaction. Source of truth for the Profiler Agent.';


-- ============================================================================
-- 5. GRADING_TASKS — async task queue (mirrors AlphaDesk scrape_tasks)
-- ============================================================================
-- "Accept fast, process slow": the frontend inserts a row, the worker picks it up.
-- Used for document ingestion (chunking + embedding) and profiler runs.

create type public.task_status as enum (
  'pending',
  'processing',
  'completed',
  'failed'
);

create type public.task_type as enum (
  'document_ingestion',   -- chunk + embed uploaded material
  'profiler_run',         -- update learner_profile from recent chat
  'digest_generation'     -- morning teacher digest
);

create table public.grading_tasks (
  id              uuid primary key default uuid_generate_v4(),
  task_type       public.task_type not null,
  status          public.task_status not null default 'pending',

  -- Polymorphic payload (depends on task_type)
  payload         jsonb not null default '{}',

  -- Worker claim (same pattern as AlphaDesk claimTask)
  claimed_by      text,                     -- worker_id string
  claimed_at      timestamptz,

  -- Result
  result          jsonb,
  error_message   text,

  -- Lifecycle
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_grading_tasks_status
  on public.grading_tasks(status)
  where status = 'pending';

create index idx_grading_tasks_type_status
  on public.grading_tasks(task_type, status);

comment on table public.grading_tasks is
  'Async task queue. Same lifecycle as AlphaDesk scrape_tasks: pending → processing → completed/failed.';


-- ============================================================================
-- 6. HELPER: semantic search function
-- ============================================================================
-- Called from the API to retrieve relevant chunks for a student query.

create or replace function public.match_documents(
  query_embedding vector(1536),
  match_course_id uuid,
  match_threshold float default 0.78,
  match_count     int   default 5
)
returns table (
  id          uuid,
  content     text,
  metadata    jsonb,
  source_file text,
  similarity  float
)
language plpgsql
as $$
begin
  return query
    select
      de.id,
      de.content,
      de.metadata,
      de.source_file,
      1 - (de.embedding <=> query_embedding) as similarity
    from public.document_embeddings de
    where de.course_id = match_course_id
      and 1 - (de.embedding <=> query_embedding) > match_threshold
    order by de.embedding <=> query_embedding
    limit match_count;
end;
$$;

comment on function public.match_documents is
  'Semantic similarity search over course embeddings. Returns top-k chunks above threshold.';


-- ============================================================================
-- 7. ROW LEVEL SECURITY (RLS) — baseline policies
-- ============================================================================
-- Service role bypasses RLS; anon/authenticated get scoped access.

alter table public.courses enable row level security;
alter table public.document_embeddings enable row level security;
alter table public.learner_profiles enable row level security;
alter table public.chat_logs enable row level security;
alter table public.grading_tasks enable row level security;

-- Courses: readable by all authenticated users
create policy "Authenticated users can read courses"
  on public.courses for select
  to authenticated
  using (true);

-- Document embeddings: readable by authenticated (needed for RAG search)
create policy "Authenticated users can read embeddings"
  on public.document_embeddings for select
  to authenticated
  using (true);

-- Learner profiles: users can only read their own
create policy "Users can read own learner profiles"
  on public.learner_profiles for select
  to authenticated
  using (auth.uid() = user_id);

-- Chat logs: users can read/insert their own
create policy "Users can read own chat logs"
  on public.chat_logs for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own chat logs"
  on public.chat_logs for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Grading tasks: only service role writes (workers), authenticated can read status
create policy "Authenticated users can read task status"
  on public.grading_tasks for select
  to authenticated
  using (true);


-- ============================================================================
-- 8. UPDATED_AT TRIGGER — auto-update timestamps
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_courses_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

create trigger trg_learner_profiles_updated_at
  before update on public.learner_profiles
  for each row execute function public.set_updated_at();

create trigger trg_grading_tasks_updated_at
  before update on public.grading_tasks
  for each row execute function public.set_updated_at();


-- ============================================================================
-- 9. REALTIME — enable for task queue (mirrors AlphaDesk worker subscription)
-- ============================================================================

alter publication supabase_realtime add table public.grading_tasks;
alter publication supabase_realtime add table public.chat_logs;
