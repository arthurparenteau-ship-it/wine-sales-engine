-- Align SQL matching with URL/name normalization in JavaScript. Rebuild affected expression indexes.
create or replace function public.wse_domain(value text) returns text language sql immutable strict set search_path='' as $$
 select nullif(regexp_replace(regexp_replace(lower(split_part(split_part(split_part(regexp_replace(trim(value),'^https?://','','i'),'/',1),'?',1),'#',1)),'^www\.',''),'\.$',''),'');
$$;
create or replace function public.wse_name(value text) returns text language sql immutable strict set search_path='' as $$
 select regexp_replace(translate(lower(value),'àáâäãåèéêëìíîïòóôöõùúûüçñ','aaaaaaeeeeiiiiooooouuuucn'),'[^a-z0-9]','','g');
$$;
reindex index public.companies_research_domain_idx;
reindex index public.companies_research_name_idx;
revoke all on function public.wse_domain(text),public.wse_name(text) from public,anon,authenticated;
grant execute on function public.wse_domain(text),public.wse_name(text) to service_role;
