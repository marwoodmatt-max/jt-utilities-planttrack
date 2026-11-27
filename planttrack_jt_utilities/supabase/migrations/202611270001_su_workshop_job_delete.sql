-- Allow Su Babb the same restricted unsigned workshop job cleanup access
-- as the existing PlantTrack owner. No other admin gains delete rights.
-- Signed, submitted, approved, filed and statutory LOLER records remain protected.
create or replace function public.delete_my_test_workshop_job(p_job uuid, p_confirmation text)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare v_job public.workshop_job_cards%rowtype;
begin
 if auth.uid() not in (
   '2807b17d-6507-4808-9909-15e11e44637a'::uuid,
   'cee033cb-7cab-48d6-b7b8-cbc86d97cd71'::uuid
 ) or not exists (
   select 1 from public.profiles p
   where p.id=auth.uid() and p.active and p.role::text='admin'
 ) then
   raise exception 'Only designated PlantTrack administrators may delete unsigned workshop job cards';
 end if;
 select * into v_job from public.workshop_job_cards where id=p_job for update;
 if not found then raise exception 'Job card not found'; end if;
 if p_confirmation is distinct from v_job.job_card_number then
   raise exception 'Confirm the exact job card number before deleting';
 end if;
 if v_job.status not in ('New','Assigned','In progress','Returned for correction')
    or v_job.engineer_signed_at is not null
    or v_job.office_signed_at is not null
    or v_job.approved_pdf_path is not null
    or v_job.job_card_pdf_path is not null then
   raise exception 'Signed, submitted, approved or filed records cannot be deleted. Preserve them for the audit trail';
 end if;
 if v_job.job_type like 'LOLER%' or nullif(v_job.certificate_number,'') is not null then
   raise exception 'LOLER job cards and statutory certificate references cannot be deleted';
 end if;
 delete from public.workshop_job_cards where id=v_job.id;
 return v_job.job_card_number;
end
$function$;
