create function public.wse_signal_count() returns integer language sql stable security invoker set search_path='' as $$
 select count(*)::integer from public.signals where signal_type not in ('research_evidence','scoring_evidence');
$$;
revoke all on function public.wse_signal_count() from public,anon,authenticated;
grant execute on function public.wse_signal_count() to service_role;
