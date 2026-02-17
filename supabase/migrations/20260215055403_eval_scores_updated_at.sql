-- Optional: auto-update updated_at on eval_scores

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
drop trigger if exists trg_eval_scores_updated_at on public.eval_scores;
create trigger trg_eval_scores_updated_at
before update on public.eval_scores
for each row execute procedure public.set_updated_at();
