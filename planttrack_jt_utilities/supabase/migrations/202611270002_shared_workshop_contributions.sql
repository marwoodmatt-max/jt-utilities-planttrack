-- Shared workshop visibility and append-only mechanic contribution audit.
-- The original assigned_engineer remains the lead and the sole engineer signer.
drop policy if exists "workshop_engineers_can_see_team_jobs" on public.workshop_job_cards;
create policy "workshop_engineers_can_see_team_jobs"
on public.workshop_job_cards for select to authenticated
using (
 exists (
  select 1 from public.planttrack_roles r
  join public.profiles p on p.id=r.user_id
  where r.user_id=auth.uid() and r.role='engineer'
    and p.active and p.role::text='mechanic'
 )
);

create table if not exists public.workshop_job_contributions (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public.workshop_job_cards(id) on delete restrict,
 mechanic_id uuid not null references auth.users(id),
 mechanic_name text not null,
 work_done text not null,
 parts_used text not null default '',
 hours_worked numeric(8,2) not null default 0 check (hours_worked>=0 and hours_worked<=1000),
 created_at timestamptz not null default now(),
 constraint contribution_work_length check (length(trim(work_done))>=3 and length(work_done)<=5000),
 constraint contribution_parts_length check (length(parts_used)<=2000)
);
create index if not exists workshop_contributions_job_created on public.workshop_job_contributions(job_id,created_at,id);
alter table public.workshop_job_contributions enable row level security;
grant select on public.workshop_job_contributions to authenticated;
revoke insert,update,delete on public.workshop_job_contributions from anon,authenticated;
drop policy if exists "workshop_contributions_read_for_job_viewers" on public.workshop_job_contributions;
create policy "workshop_contributions_read_for_job_viewers"
on public.workshop_job_contributions for select to authenticated
using (
 exists (
  select 1 from public.workshop_job_cards j where j.id=job_id
 )
);

create or replace function public.record_workshop_contribution(
 p_job uuid,p_work text,p_parts text default '',p_hours numeric default 0
)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare
 v_name text;
 v_id uuid;
begin
 if auth.uid() is null or not exists(
  select 1 from public.planttrack_roles r
  join public.profiles p on p.id=r.user_id
  where r.user_id=auth.uid() and r.role='engineer'
    and p.active and p.role::text='mechanic'
 ) then
  raise exception 'Active workshop mechanic account required';
 end if;
 if length(trim(coalesce(p_work,'')))<3 or length(p_work)>5000 then
  raise exception 'Describe work carried out (3 to 5000 characters)';
 end if;
 if length(coalesce(p_parts,''))>2000 then
  raise exception 'Parts description is too long';
 end if;
 if p_hours is null or p_hours<0 or p_hours>1000 then
  raise exception 'Enter valid hours (0 to 1000)';
 end if;
 -- Lock the job row: the helper cannot add evidence after the lead submits.
 perform 1 from public.workshop_job_cards j where j.id=p_job
  and j.assigned_engineer is not null
  and j.status in ('Assigned','In progress','Returned for correction')
  and j.engineer_signed_at is null for update;
 if not found then
  raise exception 'This job is not open for mechanic contributions';
 end if;
 select trim(p.full_name) into v_name from public.profiles p where p.id=auth.uid();
 if coalesce(v_name,'')='' then
  raise exception 'Mechanic profile needs a full name';
 end if;
 insert into public.workshop_job_contributions(job_id,mechanic_id,mechanic_name,work_done,parts_used,hours_worked)
 values(p_job,auth.uid(),v_name,trim(p_work),trim(coalesce(p_parts,'')),p_hours)
 returning id into v_id;
 return v_id;
end
$function$;
revoke all on function public.record_workshop_contribution(uuid,text,text,numeric) from public,anon;
grant execute on function public.record_workshop_contribution(uuid,text,text,numeric) to authenticated;
