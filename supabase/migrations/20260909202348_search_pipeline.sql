-- Search lifecycle diagnostics and request replay protection; no changes to existing company data.
alter table public.searches add column request_id uuid unique;
alter table public.searches add column updated_at timestamptz not null default now();
alter table public.searches add column error_code text;
alter table public.searches add column metrics jsonb not null default '{}'::jsonb;
create index searches_created_at_idx on public.searches(created_at desc);
create index if not exists contacts_company_id_idx on public.contacts(company_id);
create index if not exists signals_company_id_idx on public.signals(company_id);

create function public.wse_domain(value text) returns text language sql immutable strict set search_path='' as $$
 select nullif(regexp_replace(lower(split_part(regexp_replace(trim(value),'^https?://','','i'),'/',1)),'^www\.',''),'');
$$;
create function public.wse_name(value text) returns text language sql immutable strict set search_path='' as $$
 select regexp_replace(lower(translate(value,'àáâäãåèéêëìíîïòóôöõùúûüçñ','aaaaaaeeeeiiiiooooouuuucn')),'[^a-z0-9]','','g');
$$;
create index companies_research_domain_idx on public.companies(public.wse_domain(website));
create index companies_research_name_idx on public.companies(public.wse_name(name),country);

create function public.wse_expire_searches() returns void language sql security invoker set search_path='' as $$
 update public.searches set status='failed',error_code='SEARCH_EXPIRED',updated_at=now()
 where status in ('pending','running') and created_at < now()-interval '2 minutes';
$$;
create function public.wse_begin_search(p_request_id uuid,p_market text,p_type text,p_focus text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.searches; begin
 perform pg_advisory_xact_lock(731209);
 perform public.wse_expire_searches();
 select * into s from public.searches where request_id=p_request_id;
 if found then
   if s.market<>p_market or s.prospect_type<>p_type or s.product_focus<>p_focus then return jsonb_build_object('error','IDEMPOTENCY_CONFLICT'); end if;
   return jsonb_build_object('created',false,'search',to_jsonb(s)-'request_id');
 end if;
 if p_market not in ('Belgium','France','United Kingdom','Switzerland') or p_type not in ('Importer / Distributor','Premium Caviste','Restaurant','Spirits Buyer') or p_focus not in ('Wine + Armagnac','Wine','Armagnac') then
   return jsonb_build_object('error','INVALID_INPUT'); end if;
 if exists(select 1 from public.searches where status in ('pending','running')) then return jsonb_build_object('error','SEARCH_BUSY'); end if;
 if (select count(*) from public.searches where created_at>now()-interval '1 hour')>=10 then return jsonb_build_object('error','RATE_LIMITED'); end if;
 insert into public.searches(market,prospect_type,product_focus,status,request_id) values(p_market,p_type,p_focus,'pending',p_request_id) returning * into s;
 return jsonb_build_object('created',true,'search',to_jsonb(s)-'request_id');
end $$;

-- All writes below commit together, including search completion. Only server role can execute.
create function public.wse_finish_search(p_id uuid,p_candidates jsonb,p_metrics jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.searches; c jsonb; v jsonb; sig jsonb; person jsonb; existing public.companies; cid uuid;
 inserted_count integer:=0; updated_count integer:=0; matched_count integer:=0; before_row jsonb; after_row jsonb;
begin
 perform pg_advisory_xact_lock(731209);
 select * into s from public.searches where id=p_id for update;
 if not found or s.status<>'running' or s.created_at<now()-interval '2 minutes' then return jsonb_build_object('error','SEARCH_EXPIRED'); end if;
 if jsonb_typeof(p_candidates)<>'array' or jsonb_array_length(p_candidates)>20 then raise exception 'Invalid candidate batch'; end if;
 for c in select value from jsonb_array_elements(p_candidates) loop
   v:=c->'company';
   if nullif(v->>'name','') is null or v->>'country'<>s.market or jsonb_array_length(c->'signals')<1 then raise exception 'Invalid candidate'; end if;
   -- Serialize all pipeline imports. Prefer domain; fallback to name+country only if a domain is absent.
   select * into existing from public.companies
   where (nullif(v->>'website','') is not null and public.wse_domain(website)=public.wse_domain(v->>'website'))
     or (public.wse_name(name)=public.wse_name(v->>'name') and country=v->>'country' and
       (nullif(website,'') is null or nullif(v->>'website','') is null))
   order by (public.wse_domain(website)=public.wse_domain(v->>'website')) desc nulls last,id limit 1 for update;
   if found then
     cid:=existing.id; matched_count:=matched_count+1; before_row:=to_jsonb(existing)-'updated_at';
     update public.companies set
       website=coalesce(nullif(website,''),v->>'website'),city=coalesce(nullif(city,''),v->>'city'),
       company_type=coalesce(nullif(company_type,''),v->>'company_type'),description=coalesce(nullif(description,''),v->>'description'),
       wine_fit=coalesce(wine_fit,(v->>'wine_fit')::integer),armagnac_fit=coalesce(armagnac_fit,(v->>'armagnac_fit')::integer),
       commercial_potential=coalesce(commercial_potential,(v->>'commercial_potential')::integer),buying_intent=coalesce(buying_intent,(v->>'buying_intent')::integer),
       accessibility=coalesce(accessibility,(v->>'accessibility')::integer),opportunity_score=coalesce(opportunity_score,(v->>'opportunity_score')::integer)
     where id=cid returning to_jsonb(companies)-'updated_at' into after_row;
     if before_row is distinct from after_row then update public.companies set updated_at=now() where id=cid; updated_count:=updated_count+1; end if;
   else
     insert into public.companies(name,website,country,city,company_type,description,wine_fit,armagnac_fit,commercial_potential,buying_intent,accessibility,opportunity_score)
     values(v->>'name',v->>'website',v->>'country',v->>'city',v->>'company_type',v->>'description',(v->>'wine_fit')::integer,(v->>'armagnac_fit')::integer,(v->>'commercial_potential')::integer,(v->>'buying_intent')::integer,(v->>'accessibility')::integer,(v->>'opportunity_score')::integer)
     returning id into cid; inserted_count:=inserted_count+1;
   end if;
   for sig in select value from jsonb_array_elements(c->'signals') loop
     if nullif(sig->>'source_url','') is null then raise exception 'Evidence required'; end if;
     insert into public.signals(company_id,signal_type,description,signal_date,source_url,strength)
     select cid,sig->>'signal_type',sig->>'description',(sig->>'signal_date')::date,sig->>'source_url',(sig->>'strength')::integer
     where not exists(select 1 from public.signals where company_id=cid and signal_type=sig->>'signal_type'
       and source_url=sig->>'source_url' and description=sig->>'description' and signal_date is not distinct from (sig->>'signal_date')::date);
   end loop;
   for person in select value from jsonb_array_elements(c->'contacts') loop
     if nullif(person->>'source','') is null or nullif(person->>'full_name','') is null then raise exception 'Contact evidence required'; end if;
     insert into public.contacts(company_id,full_name,job_title,email,phone,linkedin_url,confidence,source)
     select cid,person->>'full_name',person->>'job_title',person->>'email',person->>'phone',person->>'linkedin_url',(person->>'confidence')::integer,person->>'source'
     where not exists(select 1 from public.contacts where company_id=cid and public.wse_name(full_name)=public.wse_name(person->>'full_name'));
     -- Existing contacts are preserved; conflicting or richer contact data requires review.
   end loop;
 end loop;
 update public.searches set status='completed',prospects_found=jsonb_array_length(p_candidates),updated_at=now(),error_code=null,
   metrics=p_metrics||jsonb_build_object('inserted',inserted_count,'updated',updated_count,'matched',matched_count)
 where id=p_id returning * into s;
 return jsonb_build_object('search',to_jsonb(s)-'request_id');
end $$;
revoke all on function public.wse_domain(text),public.wse_name(text),public.wse_expire_searches(),public.wse_begin_search(uuid,text,text,text),public.wse_finish_search(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.wse_domain(text),public.wse_name(text),public.wse_expire_searches(),public.wse_begin_search(uuid,text,text,text),public.wse_finish_search(uuid,jsonb,jsonb) to service_role;
