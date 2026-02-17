-- Add social media support to knowledge_docs.
-- Run in Supabase SQL Editor.

alter table public.knowledge_docs
add column if not exists source_platform text not null default 'youtube',
add column if not exists media_path text null,
add column if not exists media_mime text null;
