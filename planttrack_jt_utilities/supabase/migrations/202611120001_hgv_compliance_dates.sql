-- HGV-only compliance dates. Kept separate from plant LOLER examinations.
alter table public.assets
  add column if not exists pmi_next_due date,
  add column if not exists pmi_last_completed date,
  add column if not exists mot_due date,
  add column if not exists tacho_calibration_due date;

comment on column public.assets.pmi_next_due is 'Next planned HGV PMI date';
comment on column public.assets.pmi_last_completed is 'Date of last completed HGV PMI';
comment on column public.assets.mot_due is 'HGV MOT expiry date';
comment on column public.assets.tacho_calibration_due is 'HGV tachograph calibration expiry date';
