-- Authenticated workshop staff can choose an active person's verified name
-- while completing wheel re-torque records. Names are stored in the checklist/PDF.
create or replace function public.list_wheel_retorque_staff()
returns table(user_id uuid, display_name text)
language sql stable security definer
set search_path to ''
as $function$
 select distinct p.id, trim(p.full_name)
 from public.profiles p
 where auth.uid() is not null
   and exists (
     select 1 from public.planttrack_roles viewer
     where viewer.user_id=auth.uid() and viewer.role in ('office','engineer')
   )
   and p.active=true
   and nullif(trim(p.full_name),'') is not null
   and exists (
     select 1 from public.planttrack_roles worker
     where worker.user_id=p.id and worker.role='engineer'
   )
 order by 2
$function$;
revoke all on function public.list_wheel_retorque_staff() from public, anon;
grant execute on function public.list_wheel_retorque_staff() to authenticated;
