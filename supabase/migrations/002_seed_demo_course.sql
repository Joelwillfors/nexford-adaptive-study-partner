-- ============================================================================
-- Seed: Demo course for MVP testing
-- ============================================================================

insert into public.courses (id, title, description)
values (
  '00000000-0000-0000-0000-000000000001',
  'Business Fundamentals',
  'Core MBA concepts: unit economics, marketing strategy, financial accounting, and customer analytics.'
)
on conflict (id) do nothing;
