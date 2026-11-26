-- One securely stored, user-supplied main photograph for each registered asset.
alter table public.assets
 add column if not exists asset_image_path text;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
 values ('asset-images','asset-images',false,5242880,array['image/jpeg','image/png','image/webp'])
 on conflict (id) do update
 set public=false, file_size_limit=5242880,
     allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create policy "Active users can read asset photos"
 on storage.objects for select to authenticated
 using (bucket_id='asset-images' and public.has_active_role(
  array['admin','plant_manager','supervisor','operator','mechanic','inspector','director']::public.app_role[]
 ));

create policy "Admins can add asset photos"
 on storage.objects for insert to authenticated
 with check (bucket_id='asset-images'
  and public.has_active_role(array['admin']::public.app_role[])
  and exists (
   select 1 from public.assets a
   where a.id::text=(storage.foldername(name))[1]
  ));

create policy "Admins can delete asset photos"
 on storage.objects for delete to authenticated
 using (bucket_id='asset-images' and public.has_active_role(array['admin']::public.app_role[]));
