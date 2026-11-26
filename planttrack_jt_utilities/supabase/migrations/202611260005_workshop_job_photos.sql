-- Optional per-job evidence photos; deliberately excluded from statutory LOLER.
create table if not exists public.workshop_job_photos (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public.workshop_job_cards(id) on delete restrict,
 storage_path text not null unique,
 caption text not null default '',
 uploaded_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 constraint workshop_photo_caption_length check (length(caption)<=160)
);
create index if not exists workshop_job_photos_job_idx on public.workshop_job_photos(job_id,created_at,id);
alter table public.workshop_job_photos enable row level security;
grant select,insert,delete on public.workshop_job_photos to authenticated;

create or replace function public.can_access_workshop_job_photos(p_job uuid,p_write boolean default false)
returns boolean language sql stable security definer set search_path to ''
as $function$
 select auth.uid() is not null and exists(
  select 1 from public.workshop_job_cards j
  where j.id=p_job
   and j.job_type not in ('LOLER thorough examination','LOLER chains & accessories')
   and (
    (not p_write and (
      public.planttrack_is_office()
      or (j.assigned_engineer=auth.uid()
          and exists(select 1 from public.planttrack_roles r where r.user_id=auth.uid() and r.role='engineer'))
    ))
    or (p_write
      and j.assigned_engineer=auth.uid()
      and j.status in ('Assigned','In progress','Returned for correction')
      and j.engineer_signed_at is null
      and exists(select 1 from public.planttrack_roles r where r.user_id=auth.uid() and r.role='engineer'))
   )
 )
$function$;
revoke all on function public.can_access_workshop_job_photos(uuid,boolean) from public,anon;
grant execute on function public.can_access_workshop_job_photos(uuid,boolean) to authenticated;

create policy "Read authorised job photos"
 on public.workshop_job_photos for select to authenticated
 using (public.can_access_workshop_job_photos(job_id,false));

create policy "Mechanics add photos to their open jobs"
 on public.workshop_job_photos for insert to authenticated
 with check (uploaded_by=auth.uid()
  and storage_path like job_id::text||'/%'
  and public.can_access_workshop_job_photos(job_id,true));

create policy "Mechanics remove photos from their open jobs"
 on public.workshop_job_photos for delete to authenticated
 using (uploaded_by=auth.uid() and public.can_access_workshop_job_photos(job_id,true));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
 values ('workshop-job-photos','workshop-job-photos',false,5242880,array['image/jpeg','image/png'])
 on conflict (id) do update
 set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png'];

create policy "Workshop role can view permitted job evidence"
 on storage.objects for select to authenticated
 using (bucket_id='workshop-job-photos'
  and exists(select 1 from public.workshop_job_photos p
   where p.storage_path=name and public.can_access_workshop_job_photos(p.job_id,false)));

create policy "Mechanic uploads own open job evidence"
 on storage.objects for insert to authenticated
 with check (bucket_id='workshop-job-photos'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and public.can_access_workshop_job_photos(((storage.foldername(name))[1])::uuid,true));

create policy "Mechanic deletes own open job evidence"
 on storage.objects for delete to authenticated
 using (bucket_id='workshop-job-photos'
  and exists(select 1 from public.workshop_job_photos p
   where p.storage_path=name and p.uploaded_by=auth.uid()
   and public.can_access_workshop_job_photos(p.job_id,true)));
