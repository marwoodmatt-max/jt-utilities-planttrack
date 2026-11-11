-- JT Utilities PlantTrack initial schema
-- Run in Supabase SQL Editor after creating a project in eu-west-2.
create extension if not exists pgcrypto;

create type public.app_role as enum ('plant_manager','operator','mechanic','inspector','director','admin');
create type public.asset_status as enum ('available','in_use','in_workshop','out_of_service','off_hire');
create type public.job_status as enum ('raised','received','allocated','in_progress','awaiting_parts','repair_completed','awaiting_approval','closed','cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'operator',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  asset_code text unique not null,
  description text not null,
  category text,
  manufacturer text,
  model text,
  serial_number text,
  registration text,
  location text,
  hour_meter numeric,
  status public.asset_status not null default 'available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id),
  inspection_type text not null,
  result text not null check (result in ('pass','fail','not_applicable')),
  answers jsonb not null default '{}'::jsonb,
  comments text,
  meter_reading numeric,
  submitted_by uuid not null references public.profiles(id),
  submitted_at timestamptz not null default now(),
  status text not null default 'submitted'
);

create table public.examinations (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id),
  examination_type text not null,
  examination_scheme text,
  examined_at date not null,
  next_due date,
  competent_person text not null,
  report_reference text,
  report_path text,
  defects jsonb not null default '[]'::jsonb,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.job_cards (
  id uuid primary key default gen_random_uuid(),
  job_number bigint generated always as identity unique,
  asset_id uuid not null references public.assets(id),
  fault_description text not null,
  priority text not null default 'normal' check (priority in ('normal','high','critical')),
  status public.job_status not null default 'raised',
  raised_by uuid not null references public.profiles(id),
  assigned_to uuid references public.profiles(id),
  raised_at timestamptz not null default now(),
  completed_at timestamptz,
  supervisor_approved_by uuid references public.profiles(id)
);

create table public.job_updates (
  id uuid primary key default gen_random_uuid(),
  job_card_id uuid not null references public.job_cards(id),
  update_text text not null,
  parts_used jsonb not null default '[]'::jsonb,
  labour_hours numeric,
  photo_paths text[] not null default '{}',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Append-only audit events. Do not grant ordinary users UPDATE or DELETE.
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz not null default now()
);

create index assets_code_idx on public.assets(asset_code);
create index inspections_asset_date_idx on public.inspections(asset_id, submitted_at desc);
create index examinations_due_idx on public.examinations(next_due);
create index jobs_status_idx on public.job_cards(status, raised_at desc);
create index audit_entity_idx on public.audit_events(entity_type, entity_id, occurred_at desc);

-- Enable RLS. Policies must be added and tested before production use.
alter table public.profiles enable row level security;
alter table public.assets enable row level security;
alter table public.inspections enable row level security;
alter table public.examinations enable row level security;
alter table public.job_cards enable row level security;
alter table public.job_updates enable row level security;
alter table public.audit_events enable row level security;

-- Intentionally no permissive policies are included. Configure role-aware
-- policies before inviting users or connecting a production client.
