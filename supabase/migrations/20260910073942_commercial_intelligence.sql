-- Intelligence snapshots are separate from preserved reviewed company scores.
alter table public.companies add column research_profile jsonb not null default '{}'::jsonb check(jsonb_typeof(research_profile)='object' and octet_length(research_profile::text)<=262144);
alter table public.companies add column last_researched_at timestamptz;
-- Existing sourced summaries become legacy evidence, without claiming a fresh research run.
update public.companies c set research_profile=jsonb_build_object('version','legacy','product_focus','Wine + Armagnac','evidence',coalesce((select jsonb_agg(e) from (select jsonb_build_object('source_url',source_url,'quote',left(description,1600),'signal_type',signal_type,'signal_date',signal_date,'legacy',true,'claim_type','signal') e from public.signals where company_id=c.id and source_url is not null and signal_type not in ('research_evidence','scoring_evidence') order by created_at desc limit 40)s),'[]'::jsonb));
create table public.search_companies(search_id uuid not null references public.searches(id) on delete cascade,company_id uuid not null references public.companies(id) on delete cascade,primary key(search_id,company_id));
create index search_companies_company_idx on public.search_companies(company_id);
alter table public.search_companies enable row level security;
revoke all on public.search_companies from public,anon,authenticated;
grant select,insert on public.search_companies to service_role;
-- Private calibration foundation. No public HTTP write endpoint or browser editing is introduced.
create table public.company_reviews(company_id uuid primary key references public.companies(id) on delete cascade,user_priority_rating integer check(user_priority_rating between 1 and 5),user_note text check(length(user_note)<=2000),commercial_status text check(commercial_status in ('New','To Contact','Contacted','Qualified','Not Relevant','Customer','Monitor')),reviewed_at timestamptz not null default now());
alter table public.company_reviews enable row level security;
revoke all on public.company_reviews from public,anon,authenticated;
grant select,insert,update,delete on public.company_reviews to service_role;
create index searches_cache_idx on public.searches(market,prospect_type,product_focus,created_at desc) where status='completed';
drop function public.wse_begin_search(uuid,text,text,text);
create function public.wse_begin_search(p_request_id uuid,p_market text,p_type text,p_focus text,p_refresh boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.searches; begin
 perform pg_advisory_xact_lock(731209);
 perform public.wse_expire_searches();
 select * into s from public.searches where request_id=p_request_id;
 if found then
   if s.market<>p_market or s.prospect_type<>p_type or s.product_focus<>p_focus then return jsonb_build_object('error','IDEMPOTENCY_CONFLICT'); end if;
   return jsonb_build_object('created',false,'search',to_jsonb(s)-'request_id');
 end if;
 if p_request_id is null or p_market is null or p_type is null or p_focus is null then return jsonb_build_object('error','INVALID_INPUT'); end if;
 if p_market not in ('Belgium','France','United Kingdom','Switzerland') or p_type not in ('Importer / Distributor','Premium Caviste','Restaurant','Spirits Buyer') or p_focus not in ('Wine + Armagnac','Wine','Armagnac') then
   return jsonb_build_object('error','INVALID_INPUT'); end if;
 if not p_refresh then
   select * into s from public.searches where market=p_market and prospect_type=p_type and product_focus=p_focus and status='completed' and created_at>now()-interval '6 hours' and metrics->>'engine_version'='intelligence-v2' order by created_at desc limit 1;
   if found then return jsonb_build_object('created',false,'cached',true,'search',to_jsonb(s)-'request_id'); end if;
 end if;
 if exists(select 1 from public.searches where status in ('pending','running')) then return jsonb_build_object('error','SEARCH_BUSY'); end if;
 if (select count(*) from public.searches where created_at>now()-interval '1 hour')>=10 then return jsonb_build_object('error','RATE_LIMITED'); end if;
 insert into public.searches(market,prospect_type,product_focus,status,request_id) values(p_market,p_type,p_focus,'pending',p_request_id) returning * into s;
 return jsonb_build_object('created',true,'search',to_jsonb(s)-'request_id');
end $$;

create or replace function public.wse_finish_search(p_id uuid,p_candidates jsonb,p_metrics jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.searches; c jsonb; v jsonb; sig jsonb; person jsonb; existing public.companies; cid uuid;
 inserted_count integer:=0; updated_count integer:=0; matched_count integer:=0; before_row jsonb; after_row jsonb;
begin
 perform pg_advisory_xact_lock(731209);
 select * into s from public.searches where id=p_id for update;
 if not found or s.status<>'running' or s.created_at<now()-interval '2 minutes' then return jsonb_build_object('error','SEARCH_EXPIRED'); end if;
 if p_candidates is null or jsonb_typeof(p_candidates)<>'array' or jsonb_array_length(p_candidates)>20 then raise exception 'Invalid candidate batch'; end if;
 for c in select value from jsonb_array_elements(p_candidates) loop
   v:=c->'company';
   if jsonb_typeof(c->'signals') is distinct from 'array' or jsonb_typeof(c->'contacts') is distinct from 'array' or jsonb_array_length(c->'signals')>80 or jsonb_array_length(c->'contacts')>10 then raise exception 'Invalid evidence arrays'; end if;
   if nullif(v->>'name','') is null or v->>'country' is distinct from s.market or jsonb_array_length(c->'signals')<1 then raise exception 'Invalid candidate'; end if;
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
   if v ? 'research_profile' then
     if jsonb_typeof(v->'research_profile'->'evidence') is distinct from 'array' or jsonb_array_length(v->'research_profile'->'evidence')>40 then raise exception 'Invalid profile'; end if;
     update public.companies set research_profile=v->'research_profile',last_researched_at=now() where id=cid;
   end if;
   insert into public.search_companies(search_id,company_id) values(p_id,cid) on conflict do nothing;
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

revoke all on function public.wse_begin_search(uuid,text,text,text,boolean),public.wse_finish_search(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.wse_begin_search(uuid,text,text,text,boolean),public.wse_finish_search(uuid,jsonb,jsonb) to service_role;
