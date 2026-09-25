-- Only request IDs and timestamps are stored; no query text or web results.
create table public.wse_web_requests (
 request_id uuid primary key,
 created_at timestamptz not null default now()
);
create index wse_web_requests_time_idx on public.wse_web_requests(created_at);
alter table public.wse_web_requests enable row level security;
revoke all on public.wse_web_requests from public,anon,authenticated;
grant select,insert,delete on public.wse_web_requests to service_role;

create function public.wse_reserve_web_search(p_request_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare used integer;
begin
 perform pg_advisory_xact_lock(731211);
 if p_request_id is null then return jsonb_build_object('error','INVALID_WEB_INPUT'); end if;
 if exists(select 1 from public.wse_web_requests where request_id=p_request_id) then return jsonb_build_object('error','WEB_REQUEST_USED'); end if;
 if exists(select 1 from public.wse_web_requests where created_at>now()-interval '1 second') then return jsonb_build_object('error','RATE_LIMITED'); end if;
 select count(*) into used from public.wse_web_requests where created_at>now()-interval '24 hours';
 if used>=100 then return jsonb_build_object('error','WEB_DAILY_LIMIT'); end if;
 if (select count(*) from public.wse_web_requests where created_at>now()-interval '1 minute')>=20 then return jsonb_build_object('error','RATE_LIMITED'); end if;
 delete from public.wse_web_requests where created_at<now()-interval '7 days';
 insert into public.wse_web_requests(request_id) values(p_request_id);
 return jsonb_build_object('allowed',true,'remaining',99-used);
end $$;
revoke all on function public.wse_reserve_web_search(uuid) from public,anon,authenticated;
grant execute on function public.wse_reserve_web_search(uuid) to service_role;
