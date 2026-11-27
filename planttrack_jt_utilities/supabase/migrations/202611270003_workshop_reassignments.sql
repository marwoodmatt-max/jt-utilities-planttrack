-- Transfer lead responsibility on open non-LOLER workshop work, with permanent history.
create table if not exists public.workshop_job_reassignments(
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public.workshop_job_cards(id) on delete restrict,
 previous_lead uuid not null references auth.users(id),
 new_lead uuid not null references auth.users(id),
 previous_lead_name text not null,
 new_lead_name text not null,
 reassigned_by uuid not null references auth.users(id),
 reassigned_by_name text not null,
 reason text not null,
 created_at timestamptz not null default now(),
 constraint workshop_reassignment_reason_len check (length(trim(reason))>=5 and length(reason)<=1000)
);
create index if not exists workshop_reassignments_job_time on public.workshop_job_reassignments(job_id,created_at,id);
alter table public.workshop_job_reassignments enable row level security;
grant select on public.workshop_job_reassignments to authenticated;
revoke insert,update,delete on public.workshop_job_reassignments from anon,authenticated;
drop policy if exists "Job viewers see reassignment audit" on public.workshop_job_reassignments;
create policy "Job viewers see reassignment audit" on public.workshop_job_reassignments
for select to authenticated
using(exists(select 1 from public.workshop_job_cards j where j.id=job_id));

create or replace function public.reassign_open_workshop_job(
 p_job uuid,p_new_lead uuid,p_reason text
) returns void
language plpgsql security definer set search_path to ''
as $function$
declare
 v_job public.workshop_job_cards%rowtype;
 v_old_name text;
 v_new_name text;
 v_actor_name text;
begin
 if auth.uid() is null or not exists(
  select 1 from public.planttrack_roles r
  join public.profiles p on p.id=r.user_id
  where r.user_id=auth.uid()
  and r.role in ('engineer','office')
  and p.active
 ) then
  raise exception 'Active workshop mechanic or office account required';
 end if;
 if p_reason is null or length(trim(p_reason))<5 or length(p_reason)>1000 then
  raise exception 'Enter a reassignment reason (5 to 1000 characters)';
 end if;
 if not exists(
  select 1 from public.planttrack_roles r
  join public.profiles p on p.id=r.user_id
  where r.user_id=p_new_lead and r.role='engineer'
  and p.active and p.role::text='mechanic'
 ) then
  raise exception 'Choose an active workshop mechanic';
 end if;
 select * into v_job from public.workshop_job_cards where id=p_job for update;
 if not found then raise exception 'Job not found'; end if;
 if v_job.assigned_engineer is null then raise exception 'Job has no lead mechanic yet: office must allocate it first';end if;
 if v_job.assigned_engineer=p_new_lead then raise exception 'The chosen mechanic already leads this job';end if;
 if v_job.status not in ('Assigned','In progress','Returned for correction')
  or v_job.engineer_signed_at is not null
  or v_job.office_signed_at is not null
  or v_job.approved_pdf_path is not null
  or v_job.job_card_pdf_path is not null then
  raise exception 'Only unsigned, open jobs can change lead mechanic';
 end if;
 if v_job.job_type like 'LOLER%' or nullif(v_job.certificate_number,'') is not null then
  raise exception 'LOLER responsibility changes require office handling';
 end if;
 select trim(full_name) into v_old_name from public.profiles where id=v_job.assigned_engineer;
 select trim(full_name) into v_new_name from public.profiles where id=p_new_lead;
 select trim(full_name) into v_actor_name from public.profiles where id=auth.uid();
 insert into public.workshop_job_reassignments(job_id,previous_lead,new_lead,previous_lead_name,new_lead_name,reassigned_by,reassigned_by_name,reason)
 values (p_job,v_job.assigned_engineer,p_new_lead,coalesce(nullif(v_old_name,''),'Previous lead'),
 coalesce(nullif(v_new_name,''),'New lead'),auth.uid(),coalesce(nullif(v_actor_name,''),'Workshop user'),trim(p_reason));
 update public.workshop_job_cards set assigned_engineer=p_new_lead,updated_at=now()
 where id=p_job;
end
$function$;
revoke all on function public.reassign_open_workshop_job(uuid,uuid,text) from public,anon;
grant execute on function public.reassign_open_workshop_job(uuid,uuid,text) to authenticated;
