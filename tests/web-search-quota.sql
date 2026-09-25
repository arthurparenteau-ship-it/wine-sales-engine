-- Run only on an isolated database after the worldwide_web_search migration.
-- All quota fixtures roll back. Never operates on companies or scoring.
begin;
do $$
declare id uuid:=gen_random_uuid(); r jsonb;
begin
 if exists(select 1 from public.wse_web_requests) then raise exception 'Use an empty isolated test database'; end if;
 r:=public.wse_reserve_web_search(id);
 if r->>'allowed'<>'true' or (r->>'remaining')::int<>99 then raise exception 'First reservation failed'; end if;
 if public.wse_reserve_web_search(id)->>'error'<>'WEB_REQUEST_USED' then raise exception 'Replay allowed'; end if;
 if public.wse_reserve_web_search(gen_random_uuid())->>'error'<>'RATE_LIMITED' then raise exception 'Burst allowed'; end if;
 update public.wse_web_requests set created_at=now()-interval '10 seconds';
 insert into public.wse_web_requests select gen_random_uuid(),now()-interval '10 seconds' from generate_series(1,19);
 if public.wse_reserve_web_search(gen_random_uuid())->>'error'<>'RATE_LIMITED' then raise exception 'Minute budget exceeded'; end if;
 update public.wse_web_requests set created_at=now()-interval '2 hours';
 insert into public.wse_web_requests select gen_random_uuid(),now()-interval '2 hours' from generate_series(1,80);
 if public.wse_reserve_web_search(gen_random_uuid())->>'error'<>'WEB_DAILY_LIMIT' then raise exception 'Daily budget exceeded'; end if;
 update public.wse_web_requests set created_at=now()-interval '25 hours';
 if (public.wse_reserve_web_search(gen_random_uuid())->>'remaining')::int<>99 then raise exception 'Budget did not recover'; end if;
 update public.wse_web_requests set created_at=now()-interval '8 days';
 perform public.wse_reserve_web_search(gen_random_uuid());
 if (select count(*) from public.wse_web_requests)<>1 then raise exception 'Old request cleanup failed'; end if;
 if has_table_privilege('anon','public.wse_web_requests','SELECT') or has_function_privilege('anon','public.wse_reserve_web_search(uuid)','EXECUTE') or has_function_privilege('authenticated','public.wse_reserve_web_search(uuid)','EXECUTE') then raise exception 'Public access granted'; end if;
 if not has_function_privilege('service_role','public.wse_reserve_web_search(uuid)','EXECUTE') then raise exception 'Server cannot reserve'; end if;
end $$;
rollback;
