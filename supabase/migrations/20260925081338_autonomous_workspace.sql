-- Additive, single-estate operator workspace; no existing scores or evidence changed.
alter table public.company_reviews add column if not exists next_followup_at date;
create index if not exists company_reviews_followup_idx on public.company_reviews(next_followup_at) where next_followup_at is not null;
create table public.wse_campaigns (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 80),
 segments jsonb not null check(jsonb_typeof(segments)='array' and jsonb_array_length(segments) between 1 and 4),
 status text not null default 'paused' check(status in ('active','paused','completed')),
 run_budget integer not null default 12 check(run_budget between 1 and 60),
 runs_used integer not null default 0 check(runs_used>=0), cursor integer not null default 0,
 consecutive_failures integer not null default 0, next_run_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create index wse_campaign_due_idx on public.wse_campaigns(next_run_at) where status='active';
create table public.wse_campaign_runs (
 id uuid primary key default gen_random_uuid(),campaign_id uuid not null references public.wse_campaigns(id),
 request_id uuid not null unique default gen_random_uuid(),search_id uuid references public.searches(id),
 mode text not null check(mode in ('manual','scheduled')), status text not null default 'running' check(status in ('running','completed','failed')),
 error_code text,started_at timestamptz not null default now(),finished_at timestamptz
);
create index wse_campaign_runs_campaign_idx on public.wse_campaign_runs(campaign_id,started_at desc);
create index wse_campaign_runs_search_idx on public.wse_campaign_runs(search_id);
create index wse_campaign_runs_started_idx on public.wse_campaign_runs(started_at desc);
alter table public.wse_campaigns enable row level security;
alter table public.wse_campaign_runs enable row level security;
revoke all on public.wse_campaigns,public.wse_campaign_runs from public,anon,authenticated;
grant select,insert,update on public.wse_campaigns,public.wse_campaign_runs to service_role;

create function public.wse_claim_campaign(p_id uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.wse_campaigns; r public.wse_campaign_runs; old public.wse_campaign_runs; s public.searches; segment jsonb;
begin
 perform pg_advisory_xact_lock(731210);
 -- Resolve abandoned workers from persisted search state, without replaying their import.
 for old in select * from public.wse_campaign_runs where status='running' and started_at<now()-interval '3 minutes' for update loop
  select * into s from public.searches where request_id=old.request_id;
  update public.wse_campaign_runs set status=case when s.status='completed' then 'completed' else 'failed' end,
   search_id=s.id,error_code=case when s.status='completed' then null else 'SEARCH_EXPIRED' end,finished_at=now() where id=old.id;
  update public.wse_campaigns set consecutive_failures=case when s.status='completed' then 0 else consecutive_failures+1 end,
   status=case when runs_used>=run_budget then 'completed' when s.status is distinct from 'completed' and consecutive_failures>=2 then 'paused' else status end where id=old.campaign_id;
 end loop;
 if exists(select 1 from public.wse_campaign_runs where status='running') then return jsonb_build_object('reason','A campaign is already running'); end if;
 if (select count(*) from public.wse_campaign_runs where started_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=10 then return jsonb_build_object('reason','Daily limit reached'); end if;
 if p_id is null and exists(select 1 from public.wse_campaign_runs where mode='scheduled' and started_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') then return jsonb_build_object('reason','Scheduled run already attempted today'); end if;
 select * into c from public.wse_campaigns where runs_used<run_budget and status<>'completed'
  and ((p_id is not null and id=p_id) or (p_id is null and status='active' and next_run_at<=now()))
  order by next_run_at,id limit 1 for update;
 if not found then return jsonb_build_object('reason','No campaign due or budget exhausted'); end if;
 segment:=c.segments->(c.cursor % jsonb_array_length(c.segments));
 if segment->>'market' is null or segment->>'prospect_type' is null or segment->>'product_focus' is null or segment->>'market' not in ('Belgium','France','United Kingdom','Switzerland') or segment->>'prospect_type' not in ('Importer / Distributor','Premium Caviste','Restaurant','Spirits Buyer') or segment->>'product_focus' not in ('Wine + Armagnac','Wine','Armagnac') then raise exception 'Invalid campaign segment'; end if;
 insert into public.wse_campaign_runs(campaign_id,mode) values(c.id,case when p_id is null then 'scheduled' else 'manual' end) returning * into r;
 update public.wse_campaigns set runs_used=runs_used+1,cursor=cursor+1,next_run_at=now()+interval '1 day' where id=c.id;
 return jsonb_build_object('run',to_jsonb(r),'segment',segment);
end $$;
create function public.wse_complete_campaign_run(p_run uuid,p_search uuid,p_ok boolean,p_error text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.wse_campaign_runs; s public.searches; ok boolean;
begin
 perform pg_advisory_xact_lock(731210);
 select * into r from public.wse_campaign_runs where id=p_run for update;
 if not found then raise exception 'Run not found'; end if;
 if r.status<>'running' then return to_jsonb(r); end if;
 -- The actual stored search outcome is authoritative, including an ambiguous HTTP response.
 select * into s from public.searches where request_id=r.request_id or id=p_search order by (request_id=r.request_id) desc nulls last limit 1;
 if found and s.request_id is distinct from r.request_id then
  -- Completed cache entries may belong to an earlier request; no new research spend.
  if s.status<>'completed' then raise exception 'Search does not match run'; end if;
 end if;
 ok:=coalesce(s.status='completed',false);
 update public.wse_campaign_runs set search_id=s.id,status=case when ok then 'completed' else 'failed' end,
  error_code=case when ok then null else left(coalesce(p_error,'DATABASE_UNAVAILABLE'),64) end,finished_at=now() where id=r.id returning * into r;
 update public.wse_campaigns set consecutive_failures=case when ok then 0 else consecutive_failures+1 end,
  status=case when runs_used>=run_budget then 'completed' when not ok and consecutive_failures>=2 then 'paused' else status end where id=r.campaign_id;
 return to_jsonb(r);
end $$;
revoke all on function public.wse_claim_campaign(uuid),public.wse_complete_campaign_run(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.wse_claim_campaign(uuid),public.wse_complete_campaign_run(uuid,uuid,boolean,text) to service_role;
