-- Create private storage bucket for training uploads.
-- Name: training_media

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'training_media') then
    insert into storage.buckets (id, name, public)
    values ('training_media', 'training_media', false);
  end if;
end $$;
