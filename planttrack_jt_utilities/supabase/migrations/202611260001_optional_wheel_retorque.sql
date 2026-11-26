-- Optional wheel removal / re-torque records use the existing job-number sequence,
-- secure engineer/office approval workflow and private asset PDF storage.
create or replace function public.validate_loler_job_type(p_type text)
returns boolean language sql immutable set search_path to ''
as $function$
 select p_type in (
  'General repair','Breakdown','Service','HGV / trailer PMI',
  'LOLER thorough examination','LOLER chains & accessories',
  'Defect rectification','Other / unexpected work',
  'Pre-use / return-to-work check','Wheel removal / re-torque'
 )
$function$;

-- Safety gate: a wheel record cannot be submitted or approved without
-- initial torque and both independently logged follow-up checks.
create or replace function public.validate_wheel_retorque_completion()
returns trigger language plpgsql set search_path to ''
as $function$
declare c jsonb; field_name text; has_position boolean;
begin
 if new.job_type <> 'Wheel removal / re-torque' or
    new.status not in ('Awaiting office approval','Approved') then
  return new;
 end if;
 c:=coalesce(new.completion_checklist,'{}'::jsonb);
 foreach field_name in array array[
  'Refit date','Refit mileage','Refitted and torqued by','Initial re-torque confirmed',
  '2nd re-torque by','2nd re-torque mileage','2nd re-torque date',
  '3rd re-torque by','3rd re-torque mileage','3rd re-torque date'
 ] loop
  if length(trim(coalesce(c->>field_name,'')))=0 then
    raise exception 'Wheel re-torque record incomplete: %',field_name;
  end if;
 end loop;
 if c->>'Initial re-torque confirmed'<>'Yes' then
  raise exception 'Initial wheel torque must be confirmed';
 end if;
 select exists(select 1 from jsonb_each_text(c) x
               where x.key like 'Wheel: %' and x.value='Yes')
 into has_position;
 if not has_position then raise exception 'Select at least one wheel position';end if;
 if (c->>'Refit date') !~ '^\\d{4}-\\d{2}-\\d{2}$' or
    (c->>'2nd re-torque date') !~ '^\\d{4}-\\d{2}-\\d{2}$' or
    (c->>'3rd re-torque date') !~ '^\\d{4}-\\d{2}-\\d{2}$' then
  raise exception 'Enter valid ISO dates for all three wheel checks';
 end if;
 if (c->>'2nd re-torque date') < (c->>'Refit date') or
    (c->>'3rd re-torque date') < (c->>'2nd re-torque date') then
  raise exception 'Wheel re-torque check dates are out of order';
 end if;
 return new;
end
$function$;

drop trigger if exists validate_wheel_retorque_on_submit on public.workshop_job_cards;
create trigger validate_wheel_retorque_on_submit
before insert or update of status,completion_checklist on public.workshop_job_cards
for each row execute function public.validate_wheel_retorque_completion();
