-- Keep the workshop job-type CHECK aligned with the new optional wheel record.
-- All previous allowed job types remain valid.
alter table public.workshop_job_cards
 drop constraint if exists workshop_job_cards_job_type_check;

alter table public.workshop_job_cards
 add constraint workshop_job_cards_job_type_check
 check (job_type in (
  'General repair',
  'Breakdown',
  'Service',
  'HGV / trailer PMI',
  'LOLER thorough examination',
  'LOLER chains & accessories',
  'Defect rectification',
  'Other / unexpected work',
  'Pre-use / return-to-work check',
  'Wheel removal / re-torque'
 ));
