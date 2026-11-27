-- Keep filed LOLER statutory certificate linked to the active examination/calendar entry.
-- Allow signed, versioned JT workshop job cards while preserving previously filed originals.
CREATE OR REPLACE FUNCTION public.attach_approved_job_pdf(p_job uuid, p_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_asset uuid; v_existing text; v_email text; v_cert text; v_type text;
begin
 if auth.uid() is null or not public.planttrack_is_office() then raise exception 'Office access required'; end if;
 select asset_id,approved_pdf_path,certificate_number,job_type
 into v_asset,v_existing,v_cert,v_type
 from public.workshop_job_cards where id=p_job and status='Approved' for update;
 if not found then raise exception 'Job is not approved'; end if;
 if p_path <> v_asset::text||'/'||p_job::text||'.pdf' then raise exception 'Invalid asset certificate path'; end if;
 if not exists(select 1 from storage.objects where bucket_id='planttrack-job-certificates' and name=p_path) then raise exception 'PDF not found in private storage'; end if;
 if v_existing is not null then
   if v_existing=p_path then return;end if;
   raise exception 'Certificate already attached';
 end if;
 select email into v_email from auth.users where id=auth.uid();
 update public.workshop_job_cards set approved_pdf_path=p_path,pdf_filed_at=now(),
   pdf_filed_by=auth.uid(),pdf_filed_by_email=v_email,updated_at=now() where id=p_job;

 -- Keep the actual filed statutory certificate linked to the examination that
 -- drives the LOLER calendar; do not create a second due-date entry here.
 if v_type in ('LOLER thorough examination','LOLER chains & accessories') then
   update public.examinations
   set report_path=p_path
   where asset_id=v_asset
     and report_reference=v_cert
     and examination_type=case when v_type='LOLER thorough examination' then 'LOLER plant' else 'LOLER chains & accessories' end
     and report_path is null;
   if not found then
     raise exception 'LOLER calendar examination record not found; certificate filing cancelled';
   end if;
 end if;
end $function$;

CREATE OR REPLACE FUNCTION public.attach_workshop_job_card_pdf(p_job uuid, p_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_asset uuid;v_existing text;
begin
 if auth.uid() is null or not public.planttrack_is_office() then raise exception 'Office access required';end if;
 select asset_id,job_card_pdf_path into v_asset,v_existing from public.workshop_job_cards where id=p_job and status='Approved' for update;
 if not found then raise exception 'Job is not approved';end if;
 if p_path<>v_asset::text||'/'||p_job::text||'-job-card.pdf'
    and p_path !~ ('^'||v_asset::text||'/'||p_job::text||'-job-card-[0-9]{17}\.pdf$')
 then raise exception 'Invalid job-card path';end if;
 if not exists(select 1 from storage.objects where bucket_id='planttrack-job-certificates' and name=p_path) then raise exception 'Job card PDF not in storage';end if;
 if v_existing is not null then
   if v_existing=p_path then return;end if;
   raise exception 'Job card already attached';
 end if;
 update public.workshop_job_cards set job_card_pdf_path=p_path,updated_at=now() where id=p_job;
end $function$;

revoke all on function public.attach_approved_job_pdf(uuid,text) from public,anon;
grant execute on function public.attach_approved_job_pdf(uuid,text) to authenticated;
revoke all on function public.attach_workshop_job_card_pdf(uuid,text) from public,anon;
grant execute on function public.attach_workshop_job_card_pdf(uuid,text) to authenticated;
