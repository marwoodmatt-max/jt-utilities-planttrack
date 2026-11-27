-- Office-only, audited reopening of unfiled approved LOLER inspections.
-- The previous signature and approval remain in audit_events via row triggers.
create or replace function public.return_approved_loler_for_resigning(p_job uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.workshop_job_cards%rowtype;
begin
  if auth.uid() is null or not exists (
    select 1 from public.planttrack_roles
    where user_id=auth.uid() and role='office'
  ) then
    raise exception 'Office access required';
  end if;
  select * into v_job from public.workshop_job_cards
  where id=p_job
    and job_type in ('LOLER thorough examination','LOLER chains & accessories')
    and status='Approved'
    and assigned_engineer is distinct from auth.uid()
    and approved_pdf_path is null
  for update;
  if not found then
    raise exception 'Only approved LOLER inspections without a filed statutory certificate can be returned to the inspector';
  end if;

  -- Remove the provisional examination from the active calendar;
  -- audit_examinations_changes retains its previous row for traceability.
  delete from public.examinations
  where asset_id=v_job.asset_id
    and report_reference=v_job.certificate_number
    and examination_type=case
      when v_job.job_type='LOLER thorough examination' then 'LOLER plant'
      else 'LOLER chains & accessories' end
    and report_path is null
    and created_at between v_job.office_signed_at - interval '2 minutes'
                       and v_job.office_signed_at + interval '2 minutes';

  update public.workshop_job_cards
  set status='Returned for correction',
      office_comments='Returned to the competent inspector for review and fresh signature at office request. Earlier filed job card preserved in storage and audit history.',
      office_signature=null,office_signed_at=null,
      engineer_signature=null,engineer_signed_at=null,
      job_card_pdf_path=null,pdf_filed_at=null,pdf_filed_by=null,pdf_filed_by_email=null,
      updated_at=now()
  where id=v_job.id;
end;
$$;
revoke all on function public.return_approved_loler_for_resigning(uuid) from public, anon;
grant execute on function public.return_approved_loler_for_resigning(uuid) to authenticated;
