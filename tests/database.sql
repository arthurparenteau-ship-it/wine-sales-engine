-- Run against a development database after migrations. All fixture writes roll back.
-- Admission checks deliberately remain enabled: run while no search is active and below the hourly cap.
begin;
do $$
declare req uuid:=gen_random_uuid(); sid uuid; cid uuid; r jsonb; payload jsonb; n integer;
begin
 r:=public.wse_begin_search(req,'Belgium','Importer / Distributor','Wine + Armagnac');
 if r->>'created'<>'true' then raise exception 'Admission unavailable: %',r->>'error'; end if;
 sid:=(r->'search'->>'id')::uuid;
 r:=public.wse_begin_search(req,'Belgium','Importer / Distributor','Wine + Armagnac');
 if (r->>'created')::boolean then raise exception 'Replay created a duplicate'; end if;
 r:=public.wse_begin_search(req,'France','Importer / Distributor','Wine + Armagnac');
 if r->>'error'<>'IDEMPOTENCY_CONFLICT' then raise exception 'Replay mismatch accepted'; end if;
 update public.searches set status='running' where id=sid;
 payload:=jsonb_build_array(jsonb_build_object('company',jsonb_build_object(
   'name','Rollback Integration Merchant','website','https://rollback-integration.invalid/',
   'country','Belgium','description','Preserve original','opportunity_score',90),
   'contacts',jsonb_build_array(jsonb_build_object('full_name','Fixture Person','source','https://rollback-integration.invalid/')),
   'signals',jsonb_build_array(jsonb_build_object('signal_type','research_evidence','description','Synthetic rollback-only evidence','source_url','https://rollback-integration.invalid/'))));
 r:=public.wse_finish_search(sid,payload,'{}');
 if r->'search'->>'status'<>'completed' then raise exception 'Import failed'; end if;
 select id into strict cid from public.companies where website='https://rollback-integration.invalid/';
 r:=public.wse_finish_search(sid,payload,'{}');
 if r->>'error'<>'SEARCH_EXPIRED' then raise exception 'Completed import repeated'; end if;
 r:=public.wse_begin_search(gen_random_uuid(),'Belgium','Importer / Distributor','Wine + Armagnac');
 sid:=(r->'search'->>'id')::uuid;
 update public.searches set status='running' where id=sid;
 payload:=jsonb_set(payload,'{0,company,opportunity_score}','10');
 payload:=jsonb_set(payload,'{0,company,description}','"Poorer replacement"');
 r:=public.wse_finish_search(sid,payload,'{}');
 if (r->'search'->'metrics'->>'matched')::int<>1 then raise exception 'Domain match failed'; end if;
 if (select opportunity_score<>90 or description<>'Preserve original' from public.companies where id=cid) then raise exception 'Existing data overwritten'; end if;
 select count(*) into n from public.contacts where company_id=cid;
 if n<>1 then raise exception 'Duplicate contact'; end if;
 select count(*) into n from public.signals where company_id=cid;
 if n<>1 then raise exception 'Duplicate evidence'; end if;
 if has_function_privilege('anon','public.wse_finish_search(uuid,jsonb,jsonb)','EXECUTE') then raise exception 'Import exposed to anon'; end if;
 if not has_function_privilege('service_role','public.wse_finish_search(uuid,jsonb,jsonb)','EXECUTE') then raise exception 'Server import denied'; end if;
end $$;
rollback;
