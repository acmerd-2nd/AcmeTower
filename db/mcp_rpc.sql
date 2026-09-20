-- ============================================================================
-- AcmeTower — MCP HTTPS write functions (v0.1 §36–§39, §48–§49, §74–§75)
-- ----------------------------------------------------------------------------
-- Why: /mcp runs in the worker; the Hyperdrive→Postgres TCP tunnel stalls
-- intermittently (HTTP 1101), so /mcp READS go over PostgREST and /mcp WRITES
-- go over these RPC functions (also PostgREST, HTTPS). Each function is
-- SECURITY DEFINER so it can atomically (1) enforce project ownership (§36),
-- (2) bump `version` for optimistic concurrency (§74–§75), (3) enforce the
-- state machine (§51–§54) / node-existence (§37), and (4) append the audit row
-- to activity_events with source=MCP (§48–§49) — all in ONE transaction, which
-- PostgREST cannot do with plain REST PATCH/POST.
--
-- Consumers: BOTH /mcp and the web app use these (V0.2 converged the shared-domain
-- writes; V0.3 converged the web reads). The `app_*` section at the bottom carries
-- the web-only identity/auth writes (login profile mirror, project lifecycle,
-- agent binding, credential issue/revoke) so the whole web stack stays on HTTPS
-- and never touches the flaky Hyperdrive tunnel. `app_*` use source=WEB actors.
--
-- State-machine edge tables MIRROR src/lib/core/state-machines.ts (§51–§54).
-- Keep both in sync when a transition changes.
-- ============================================================================

-- ── helpers ────────────────────────────────────────────────────────────────

create or replace function public.mcp_log(
  p_project uuid, p_actor jsonb, p_action text, p_entity_type text,
  p_entity_id uuid, p_summary text, p_before jsonb default null, p_after jsonb default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.activity_events
    (project_id, actor_type, actor_id, actor_label, source, action, entity_type, entity_id, summary, "before", "after")
  values
    (p_project,
     coalesce(p_actor->>'type','AGENT')::actor_type,
     nullif(p_actor->>'id','')::uuid,
     p_actor->>'label',
     coalesce(p_actor->>'source','MCP')::action_source,
     p_action, p_entity_type, p_entity_id, p_summary, p_before, p_after);
end $$;

-- PROJECT always resolves; PHASE/TASK/BRANCH must exist AND belong to the project.
create or replace function public.mcp_node_exists(
  p_project uuid, p_type text, p_id uuid, p_label text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_type = 'PROJECT' then return; end if;
  if p_id is null then raise exception '% 不存在', p_label; end if;
  if p_type = 'PHASE' and not exists (
       select 1 from public.phases  where id = p_id and project_id = p_project) then
    raise exception '% 不存在', p_label;
  end if;
  if p_type = 'TASK' and not exists (
       select 1 from public.tasks   where id = p_id and project_id = p_project) then
    raise exception '% 不存在', p_label;
  end if;
  if p_type = 'BRANCH' and not exists (
       select 1 from public.branches where id = p_id and project_id = p_project) then
    raise exception '% 不存在', p_label;
  end if;
end $$;

-- §51 Task transitions (no-op same-status always allowed).
create or replace function public.mcp_task_transit_ok(p_from text, p_to text)
returns boolean language sql immutable as $$
  select p_from = p_to or case p_from
    when 'TODO'        then p_to = any (array['IN_PROGRESS','CANCELLED'])
    when 'IN_PROGRESS' then p_to = any (array['BLOCKED','COMPLETED','CANCELLED'])
    when 'BLOCKED'     then p_to = any (array['IN_PROGRESS','CANCELLED'])
    when 'COMPLETED'   then false
    when 'CANCELLED'   then p_to = any (array['TODO'])
    else false
  end;
$$;

-- §52 Branch transitions.
create or replace function public.mcp_branch_transit_ok(p_from text, p_to text)
returns boolean language sql immutable as $$
  select p_from = p_to or case p_from
    when 'OPEN'        then p_to = any (array['IN_PROGRESS','RESOLVED','ABANDONED'])
    when 'IN_PROGRESS' then p_to = any (array['BLOCKED','RESOLVED','ABANDONED'])
    when 'BLOCKED'     then p_to = any (array['IN_PROGRESS','RESOLVED','ABANDONED'])
    else false
  end;
$$;

-- ── Task ────────────────────────────────────────────────────────────────────

-- p_patch keys (snake_case, only the ones present are written):
--   name, purpose, success_criteria, description, priority, progress
create or replace function public.mcp_update_task(
  p_id uuid, p_project uuid, p_patch jsonb, p_expected_version integer, p_actor jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.tasks;
begin
  update public.tasks t set
    name             = coalesce(p_patch->>'name', t.name),
    purpose          = case when p_patch ? 'purpose'          then p_patch->>'purpose'                 else t.purpose end,
    success_criteria = case when p_patch ? 'success_criteria' then p_patch->>'success_criteria'         else t.success_criteria end,
    description      = case when p_patch ? 'description'      then p_patch->>'description'              else t.description end,
    priority         = case when p_patch ? 'priority'         then (p_patch->>'priority')::task_priority else t.priority end,
    progress         = case when p_patch ? 'progress'         then least(100, greatest(0, (p_patch->>'progress')::int)) else t.progress end,
    version          = t.version + 1,
    updated_at       = now()
  where t.id = p_id and t.project_id = p_project and t.deleted_at is null
    and (p_expected_version is null or t.version = p_expected_version)
  returning t.* into r;

  if r.id is null then
    if exists (select 1 from public.tasks where id = p_id and project_id = p_project and deleted_at is null) then
      raise exception 'Task 已被其它改动更新（版本冲突），请刷新后重试';
    else
      raise exception 'Task 不存在或不属于本项目';
    end if;
  end if;

  perform public.mcp_log(r.project_id, p_actor, 'TASK_UPDATED', 'task', r.id,
    '更新任务「'||r.name||'」', null, p_patch);
  return to_jsonb(r);
end $$;

create or replace function public.mcp_set_task_status(
  p_id uuid, p_project uuid, p_to text, p_actor jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare cur public.tasks; r public.tasks;
begin
  select * into cur from public.tasks where id = p_id and project_id = p_project and deleted_at is null;
  if cur.id is null then raise exception 'Task 不存在或不属于本项目'; end if;
  if not public.mcp_task_transit_ok(cur.status::text, p_to) then
    raise exception '非法状态转换：Task % → %', cur.status, p_to;
  end if;

  update public.tasks set
    status       = p_to::task_status,
    progress     = case when p_to = 'COMPLETED' then 100 else progress end,
    completed_at = case when p_to = 'COMPLETED' then now() else completed_at end,
    version      = version + 1,
    updated_at   = now()
  where id = p_id returning * into r;

  perform public.mcp_log(r.project_id, p_actor, 'TASK_STATUS', 'task', r.id,
    '任务「'||r.name||'」状态 '||cur.status||' → '||p_to,
    jsonb_build_object('status', cur.status::text), jsonb_build_object('status', p_to));
  return to_jsonb(r);
end $$;

-- ── Branch ──────────────────────────────────────────────────────────────────

create or replace function public.mcp_create_branch(
  p_project uuid, p jsonb, p_actor jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.branches;
  v_src  text := p->>'source_type';
  v_srcid uuid := nullif(p->>'source_id','')::uuid;
  v_rpt  text := p->>'return_point_type';
  v_rptid uuid := nullif(p->>'return_point_id','')::uuid;
begin
  if coalesce(p->>'reason','') = '' or coalesce(p->>'goal','') = '' then
    raise exception '分支必须有 Source、Reason 与 Goal';
  end if;
  perform public.mcp_node_exists(p_project, v_src,  v_srcid, '来源 '||v_src);
  perform public.mcp_node_exists(p_project, v_rpt, v_rptid, 'Return Point '||v_rpt);

  insert into public.branches
    (project_id, source_type, source_id, name, reason, goal, success_criteria,
     return_point_type, return_point_id, created_by_type, created_by_id)
  values
    (p_project, v_src::node_type, v_srcid, p->>'name', p->>'reason', p->>'goal',
     nullif(p->>'success_criteria',''), v_rpt::node_type, v_rptid,
     coalesce(p_actor->>'type','AGENT')::actor_type, nullif(p_actor->>'id','')::uuid)
  returning * into r;

  perform public.mcp_log(r.project_id, p_actor, 'BRANCH_CREATED', 'branch', r.id,
    '创建分支「'||r.name||'」（来源 '||r.source_type||'，回到 '||r.return_point_type||'）',
    null, jsonb_build_object('name', r.name, 'reason', r.reason, 'goal', r.goal));
  return to_jsonb(r);
end $$;

create or replace function public.mcp_set_branch_status(
  p_id uuid, p_project uuid, p_to text, p_actor jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare cur public.branches; r public.branches;
begin
  select * into cur from public.branches where id = p_id and project_id = p_project and deleted_at is null;
  if cur.id is null then raise exception 'Branch 不存在或不属于本项目'; end if;
  if not public.mcp_branch_transit_ok(cur.status::text, p_to) then
    raise exception '非法状态转换：Branch % → %', cur.status, p_to;
  end if;

  update public.branches set
    status     = p_to::branch_status,
    closed_at  = case when p_to in ('RESOLVED','ABANDONED') then now() else closed_at end,
    version    = version + 1,
    updated_at = now()
  where id = p_id returning * into r;

  perform public.mcp_log(r.project_id, p_actor, 'BRANCH_STATUS', 'branch', r.id,
    '分支「'||r.name||'」状态 '||cur.status||' → '||p_to,
    jsonb_build_object('status', cur.status::text), jsonb_build_object('status', p_to));
  return to_jsonb(r);
end $$;

create or replace function public.mcp_close_branch(
  p_id uuid, p_project uuid, p_resolution text, p_actor jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare cur public.branches; r public.branches;
begin
  select * into cur from public.branches where id = p_id and project_id = p_project and deleted_at is null;
  if cur.id is null then raise exception 'Branch 不存在或不属于本项目'; end if;
  if not public.mcp_branch_transit_ok(cur.status::text, 'RESOLVED') then
    raise exception '非法状态转换：Branch % → RESOLVED', cur.status;
  end if;

  update public.branches set
    status     = 'RESOLVED', resolution = p_resolution, closed_at = now(),
    version    = version + 1, updated_at = now()
  where id = p_id returning * into r;

  perform public.mcp_log(r.project_id, p_actor, 'BRANCH_RESOLVED', 'branch', r.id,
    '关闭分支「'||r.name||'」并回到 '||r.return_point_type, null,
    jsonb_build_object('resolution', p_resolution));
  return to_jsonb(r);
end $$;

-- ── Issue ───────────────────────────────────────────────────────────────────

create or replace function public.mcp_create_issue(
  p_project uuid, p jsonb, p_actor jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.issues;
begin
  insert into public.issues
    (project_id, title, description, severity, source,
     related_phase_id, related_task_id, related_branch_id, created_by_id)
  values
    (p_project, p->>'title', nullif(p->>'description',''),
     coalesce(nullif(p->>'severity',''),'MEDIUM')::issue_severity, nullif(p->>'source',''),
     nullif(p->>'related_phase_id','')::uuid, nullif(p->>'related_task_id','')::uuid,
     nullif(p->>'related_branch_id','')::uuid, nullif(p_actor->>'id','')::uuid)
  returning * into r;

  perform public.mcp_log(r.project_id, p_actor, 'ISSUE_CREATED', 'issue', r.id,
    '创建 Issue「'||r.title||'」('||r.severity||')', null,
    jsonb_build_object('title', r.title, 'severity', r.severity));
  return to_jsonb(r);
end $$;

-- ── Checkpoint ────────────────────────────────────────────────────────────────

create or replace function public.mcp_create_checkpoint(
  p_project uuid, p jsonb, p_actor jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.checkpoints;
begin
  insert into public.checkpoints
    (project_id, summary, task_id, branch_id, agent_id, session_id,
     completed_items, unfinished_items, new_issues, new_decisions, new_branches,
     current_status, next_action, created_by_type, created_by_id)
  values
    (p_project, p->>'summary',
     nullif(p->>'task_id','')::uuid, nullif(p->>'branch_id','')::uuid,
     nullif(p->>'agent_id','')::uuid, nullif(p->>'session_id','')::uuid,
     coalesce(p->'completed_items','[]'::jsonb), coalesce(p->'unfinished_items','[]'::jsonb),
     coalesce(p->'new_issues','[]'::jsonb), coalesce(p->'new_decisions','[]'::jsonb), coalesce(p->'new_branches','[]'::jsonb),
     nullif(p->>'current_status',''), nullif(p->>'next_action',''),
     coalesce(p_actor->>'type','AGENT')::actor_type, nullif(p_actor->>'id','')::uuid)
  returning * into r;

  perform public.mcp_log(r.project_id, p_actor, 'CHECKPOINT_CREATED', 'checkpoint', r.id,
    'Checkpoint：'||left(r.summary, 60), null,
    jsonb_build_object('completed', jsonb_array_length(r.completed_items),
                       'unfinished', jsonb_array_length(r.unfinished_items)));
  return to_jsonb(r);
end $$;

-- ── Proposal ──────────────────────────────────────────────────────────────────

create or replace function public.mcp_create_proposal(
  p_project uuid, p jsonb, p_actor jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.proposals;
begin
  insert into public.proposals
    (project_id, kind, title, reason, description, impact, related_task_id, created_by_type, created_by_id)
  values
    (p_project, coalesce(nullif(p->>'kind',''),'OTHER')::proposal_kind, p->>'title',
     nullif(p->>'reason',''), nullif(p->>'description',''), nullif(p->>'impact',''),
     nullif(p->>'related_task_id','')::uuid,
     coalesce(p_actor->>'type','AGENT')::actor_type, nullif(p_actor->>'id','')::uuid)
  returning * into r;

  perform public.mcp_log(r.project_id, p_actor, 'PROPOSAL_CREATED', 'proposal', r.id,
    '提交提案「'||r.title||'」('||r.kind||')', null, jsonb_build_object('title', r.title, 'kind', r.kind));
  return to_jsonb(r);
end $$;

-- ── grants: only service_role (the /mcp PostgREST key) may call these ──────────

do $$
declare fn text;
begin
  foreach fn in array array[
    'mcp_log(uuid,jsonb,text,text,uuid,text,jsonb,jsonb)',
    'mcp_node_exists(uuid,text,uuid,text)',
    'mcp_task_transit_ok(text,text)',
    'mcp_branch_transit_ok(text,text)',
    'mcp_update_task(uuid,uuid,jsonb,integer,jsonb)',
    'mcp_set_task_status(uuid,uuid,text,jsonb)',
    'mcp_create_branch(uuid,jsonb,jsonb)',
    'mcp_set_branch_status(uuid,uuid,text,jsonb)',
    'mcp_close_branch(uuid,uuid,text,jsonb)',
    'mcp_create_issue(uuid,jsonb,jsonb)',
    'mcp_create_checkpoint(uuid,jsonb,jsonb)',
    'mcp_create_proposal(uuid,jsonb,jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- V0.2 write convergence — functions used ONLY by the web write layer today
-- (web and /mcp share lib/data/write-rpc.ts). Same invariants: project-ownership
-- guard, optimistic version bump, state machine, append-only audit.
-- ══════════════════════════════════════════════════════════════════════════

-- ── Task create / current-pointer / soft-delete ─────────────────────────────

create or replace function public.mcp_create_task(
  p_project uuid, p jsonb, p_actor jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.tasks;
begin
  insert into public.tasks (project_id, phase_id, name, purpose, success_criteria, description, priority)
  values (p_project, (p->>'phase_id')::uuid, p->>'name',
          nullif(p->>'purpose',''), nullif(p->>'success_criteria',''), nullif(p->>'description',''),
          coalesce(nullif(p->>'priority',''),'MEDIUM')::task_priority)
  returning * into r;
  perform public.mcp_log(r.project_id, p_actor, 'TASK_CREATED', 'task', r.id,
    '创建任务「'||r.name||'」', null, jsonb_build_object('name', r.name, 'status', r.status));
  return to_jsonb(r);
end $$;

-- soft-delete: no-op if the row is gone / not in this project (mirrors web behavior).
create or replace function public.mcp_delete_task(
  p_id uuid, p_project uuid, p_actor jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare cur public.tasks;
begin
  select * into cur from public.tasks where id = p_id and project_id = p_project and deleted_at is null;
  if cur.id is null then return null; end if;
  update public.tasks set deleted_at = now() where id = p_id;
  perform public.mcp_log(p_project, p_actor, 'TASK_DELETED', 'task', p_id, '归档任务「'||cur.name||'」', null, null);
  return jsonb_build_object('id', p_id, 'deleted', true);
end $$;

-- denormalized current pointers on projects (also bumps project.version).
create or replace function public.mcp_set_current_phase(
  p_project uuid, p_phase uuid, p_actor jsonb
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.projects set current_phase_id = p_phase, version = version + 1, updated_at = now()
   where id = p_project and deleted_at is null;
  perform public.mcp_log(p_project, p_actor, 'PROJECT_SET_PHASE', 'project', p_project,
    '当前 Phase 设为 '||p_phase, null, null);
end $$;

create or replace function public.mcp_set_current_task(
  p_project uuid, p_task uuid, p_actor jsonb
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.projects set current_task_id = p_task, version = version + 1, updated_at = now()
   where id = p_project and deleted_at is null;
  perform public.mcp_log(p_project, p_actor, 'PROJECT_SET_TASK', 'project', p_project,
    '当前 Task 设为 '||p_task, null, null);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'mcp_create_task(uuid,jsonb,jsonb)',
    'mcp_delete_task(uuid,uuid,jsonb)',
    'mcp_set_current_phase(uuid,uuid,jsonb)',
    'mcp_set_current_task(uuid,uuid,jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;

-- ── Phase ───────────────────────────────────────────────────────────────────

-- §53 Phase transitions.
create or replace function public.mcp_phase_transit_ok(p_from text, p_to text)
returns boolean language sql immutable as $$
  select p_from = p_to or case p_from
    when 'PLANNED'   then p_to = any (array['ACTIVE','CANCELLED'])
    when 'ACTIVE'    then p_to = any (array['BLOCKED','COMPLETED','CANCELLED'])
    when 'BLOCKED'   then p_to = any (array['ACTIVE','CANCELLED'])
    when 'COMPLETED' then false
    when 'CANCELLED' then p_to = any (array['PLANNED'])
    else false
  end;
$$;

create or replace function public.mcp_create_phase(
  p_project uuid, p jsonb, p_actor jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.phases; v_order integer;
begin
  v_order := coalesce(nullif(p->>'order_index','')::int,
                      (select coalesce(max(order_index),0)+1 from public.phases where project_id = p_project));
  insert into public.phases (project_id, name, goal, success_criteria, scope, description, order_index)
  values (p_project, p->>'name', nullif(p->>'goal',''), nullif(p->>'success_criteria',''),
          nullif(p->>'scope',''), nullif(p->>'description',''), v_order)
  returning * into r;
  perform public.mcp_log(r.project_id, p_actor, 'PHASE_CREATED', 'phase', r.id,
    '创建 Phase「'||r.name||'」', null, jsonb_build_object('name', r.name, 'orderIndex', r.order_index));
  return to_jsonb(r);
end $$;

create or replace function public.mcp_update_phase(
  p_id uuid, p_project uuid, p_patch jsonb, p_expected_version integer, p_actor jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.phases;
begin
  update public.phases t set
    name             = coalesce(p_patch->>'name', t.name),
    goal             = case when p_patch ? 'goal'             then nullif(p_patch->>'goal','')             else t.goal end,
    success_criteria = case when p_patch ? 'success_criteria' then nullif(p_patch->>'success_criteria','') else t.success_criteria end,
    scope            = case when p_patch ? 'scope'            then nullif(p_patch->>'scope','')            else t.scope end,
    description      = case when p_patch ? 'description'      then nullif(p_patch->>'description','')      else t.description end,
    order_index      = case when p_patch ? 'order_index'      then (p_patch->>'order_index')::int           else t.order_index end,
    version          = t.version + 1,
    updated_at       = now()
  where t.id = p_id and t.project_id = p_project and t.deleted_at is null
    and (p_expected_version is null or t.version = p_expected_version)
  returning t.* into r;
  if r.id is null then
    if exists (select 1 from public.phases where id = p_id and project_id = p_project and deleted_at is null) then
      raise exception 'Phase 已被其它改动更新（版本冲突），请刷新后重试';
    else
      raise exception 'Phase 不存在或不属于本项目';
    end if;
  end if;
  perform public.mcp_log(r.project_id, p_actor, 'PHASE_UPDATED', 'phase', r.id,
    '更新 Phase「'||r.name||'」', null, p_patch);
  return to_jsonb(r);
end $$;

create or replace function public.mcp_set_phase_status(
  p_id uuid, p_project uuid, p_to text, p_actor jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare cur public.phases; r public.phases;
begin
  select * into cur from public.phases where id = p_id and project_id = p_project and deleted_at is null;
  if cur.id is null then raise exception 'Phase 不存在或不属于本项目'; end if;
  if not public.mcp_phase_transit_ok(cur.status::text, p_to) then
    raise exception '非法状态转换：Phase % → %', cur.status, p_to;
  end if;
  update public.phases set status = p_to::phase_status, version = version + 1, updated_at = now()
   where id = p_id returning * into r;
  perform public.mcp_log(r.project_id, p_actor, 'PHASE_STATUS', 'phase', r.id,
    'Phase「'||r.name||'」状态 '||cur.status||' → '||p_to,
    jsonb_build_object('status', cur.status::text), jsonb_build_object('status', p_to));
  return to_jsonb(r);
end $$;

create or replace function public.mcp_delete_phase(
  p_id uuid, p_project uuid, p_actor jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare cur public.phases;
begin
  select * into cur from public.phases where id = p_id and project_id = p_project and deleted_at is null;
  if cur.id is null then return null; end if;
  update public.phases set deleted_at = now() where id = p_id;
  perform public.mcp_log(p_project, p_actor, 'PHASE_DELETED', 'phase', p_id, '归档 Phase「'||cur.name||'」', null, null);
  return jsonb_build_object('id', p_id, 'deleted', true);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'mcp_phase_transit_ok(text,text)',
    'mcp_create_phase(uuid,jsonb,jsonb)',
    'mcp_update_phase(uuid,uuid,jsonb,integer,jsonb)',
    'mcp_set_phase_status(uuid,uuid,text,jsonb)',
    'mcp_delete_phase(uuid,uuid,jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;

-- ── Issue ───────────────────────────────────────────────────────────────────

-- §54 Issue transitions.
create or replace function public.mcp_issue_transit_ok(p_from text, p_to text)
returns boolean language sql immutable as $$
  select p_from = p_to or case p_from
    when 'OPEN'        then p_to = any (array['IN_PROGRESS','RESOLVED','WONT_FIX'])
    when 'IN_PROGRESS' then p_to = any (array['OPEN','RESOLVED','WONT_FIX'])
    when 'RESOLVED'    then p_to = any (array['OPEN'])
    when 'WONT_FIX'    then p_to = any (array['OPEN'])
    else false
  end;
$$;

create or replace function public.mcp_set_issue_status(
  p_id uuid, p_project uuid, p_to text, p_resolution text, p_actor jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare cur public.issues; r public.issues; closing boolean;
begin
  select * into cur from public.issues where id = p_id and project_id = p_project and deleted_at is null;
  if cur.id is null then raise exception 'Issue 不存在或不属于本项目'; end if;
  if not public.mcp_issue_transit_ok(cur.status::text, p_to) then
    raise exception '非法状态转换：Issue % → %', cur.status, p_to;
  end if;
  closing := p_to in ('RESOLVED','WONT_FIX');
  update public.issues set
    status      = p_to::issue_status,
    resolution  = case when closing then coalesce(nullif(p_resolution,''), cur.resolution) else cur.resolution end,
    resolved_at = case when closing then now() else cur.resolved_at end,
    version     = version + 1,
    updated_at  = now()
  where id = p_id returning * into r;
  perform public.mcp_log(r.project_id, p_actor,
    case when closing then 'ISSUE_RESOLVED' else 'ISSUE_STATUS' end, 'issue', r.id,
    'Issue「'||r.title||'」'||cur.status||' → '||p_to,
    jsonb_build_object('status', cur.status::text),
    jsonb_build_object('status', p_to, 'resolution', r.resolution));
  return to_jsonb(r);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'mcp_issue_transit_ok(text,text)',
    'mcp_set_issue_status(uuid,uuid,text,text,jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;

-- ── Decision ────────────────────────────────────────────────────────────────

-- §54 Decision transitions.
create or replace function public.mcp_decision_transit_ok(p_from text, p_to text)
returns boolean language sql immutable as $$
  select p_from = p_to or case p_from
    when 'PROPOSED'   then p_to = any (array['APPROVED','REJECTED'])
    when 'APPROVED'   then p_to = any (array['SUPERSEDED'])
    when 'REJECTED'   then false
    when 'SUPERSEDED' then false
    else false
  end;
$$;

create or replace function public.mcp_create_decision(
  p_project uuid, p jsonb, p_actor jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.decisions;
begin
  insert into public.decisions (project_id, title, decision, reason, alternatives, impact, status, created_by)
  values (p_project, p->>'title', p->>'decision', nullif(p->>'reason',''), nullif(p->>'alternatives',''),
          nullif(p->>'impact',''), 'PROPOSED', nullif(p->>'created_by',''))
  returning * into r;
  perform public.mcp_log(r.project_id, p_actor, 'DECISION_CREATED', 'decision', r.id,
    '提出 Decision「'||r.title||'」', null, jsonb_build_object('title', r.title));
  return to_jsonb(r);
end $$;

create or replace function public.mcp_decide_decision(
  p_id uuid, p_project uuid, p_to text, p_actor jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare cur public.decisions; r public.decisions;
begin
  select * into cur from public.decisions where id = p_id and project_id = p_project and deleted_at is null;
  if cur.id is null then raise exception 'Decision 不存在或不属于本项目'; end if;
  if not public.mcp_decision_transit_ok(cur.status::text, p_to) then
    raise exception '非法状态转换：Decision % → %', cur.status, p_to;
  end if;
  update public.decisions set
    status      = p_to::decision_status,
    approved_at = case when p_to = 'APPROVED' then now() else cur.approved_at end,
    version     = version + 1,
    updated_at  = now()
  where id = p_id returning * into r;
  perform public.mcp_log(r.project_id, p_actor,
    case when p_to = 'APPROVED' then 'DECISION_APPROVED' else 'DECISION_STATUS' end, 'decision', r.id,
    'Decision「'||r.title||'」'||cur.status||' → '||p_to,
    jsonb_build_object('status', cur.status::text), jsonb_build_object('status', p_to));
  return to_jsonb(r);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'mcp_decision_transit_ok(text,text)',
    'mcp_create_decision(uuid,jsonb,jsonb)',
    'mcp_decide_decision(uuid,uuid,text,jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;

-- ── Proposal decide (§54) ─────────────────────────────────────────────────────

create or replace function public.mcp_proposal_transit_ok(p_from text, p_to text)
returns boolean language sql immutable as $$
  select p_from = p_to or case p_from
    when 'PENDING'  then p_to = any (array['APPROVED','REJECTED','PARKED'])
    when 'PARKED'   then p_to = any (array['PENDING'])
    when 'APPROVED' then false
    when 'REJECTED' then false
    else false
  end;
$$;

create or replace function public.mcp_decide_proposal(
  p_id uuid, p_project uuid, p_to text, p_actor jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare cur public.proposals; r public.proposals;
begin
  select * into cur from public.proposals where id = p_id and project_id = p_project;
  if cur.id is null then raise exception 'Proposal 不存在或不属于本项目'; end if;
  if not public.mcp_proposal_transit_ok(cur.status::text, p_to) then
    raise exception '非法状态转换：Proposal % → %', cur.status, p_to;
  end if;
  update public.proposals set
    status      = p_to::proposal_status,
    decided_by  = case when p_actor->>'type' = 'HUMAN' then nullif(p_actor->>'id','')::uuid else cur.decided_by end,
    decided_at  = now(),
    version     = version + 1,
    updated_at  = now()
  where id = p_id returning * into r;
  perform public.mcp_log(r.project_id, p_actor,
    case when p_to='APPROVED' then 'PROPOSAL_APPROVED' when p_to='REJECTED' then 'PROPOSAL_REJECTED' else 'PROPOSAL_STATUS' end,
    'proposal', r.id,
    '提案「'||r.title||'」'||cur.status||' → '||p_to,
    jsonb_build_object('status', cur.status::text), jsonb_build_object('status', p_to));
  return to_jsonb(r);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'mcp_proposal_transit_ok(text,text)',
    'mcp_decide_proposal(uuid,uuid,text,jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;

-- ── North Star (1:1 per project; human governance write from web) ──────────────

create or replace function public.mcp_upsert_north_star(
  p_project uuid, p jsonb, p_actor jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare cur public.north_star; r public.north_star; existed boolean;
begin
  select * into cur from public.north_star where project_id = p_project;
  existed := cur.id is not null;
  if existed then
    update public.north_star t set
      name             = case when p ? 'name'             then nullif(p->>'name','')             else t.name end,
      description      = case when p ? 'description'      then nullif(p->>'description','')      else t.description end,
      final_goal       = case when p ? 'final_goal'       then nullif(p->>'final_goal','')       else t.final_goal end,
      deliverable      = case when p ? 'deliverable'      then nullif(p->>'deliverable','')      else t.deliverable end,
      success_criteria = case when p ? 'success_criteria' then nullif(p->>'success_criteria','') else t.success_criteria end,
      non_goals        = case when p ? 'non_goals'        then nullif(p->>'non_goals','')        else t.non_goals end,
      constraints      = case when p ? 'constraints'      then nullif(p->>'constraints','')      else t.constraints end,
      version          = t.version + 1,
      updated_at       = now()
    where t.id = cur.id returning * into r;
  else
    insert into public.north_star (project_id, name, description, final_goal, deliverable, success_criteria, non_goals, constraints)
    values (p_project, nullif(p->>'name',''), nullif(p->>'description',''), nullif(p->>'final_goal',''),
            nullif(p->>'deliverable',''), nullif(p->>'success_criteria',''), nullif(p->>'non_goals',''), nullif(p->>'constraints',''))
    returning * into r;
  end if;
  perform public.mcp_log(p_project, p_actor,
    case when existed then 'NORTH_STAR_UPDATED' else 'NORTH_STAR_CREATED' end, 'north_star', r.id,
    case when existed then '更新 North Star' else '创建 North Star' end, null, p);
  return to_jsonb(r);
end $$;

do $$
begin
  execute 'revoke all on function public.mcp_upsert_north_star(uuid,jsonb,jsonb) from public';
  execute 'grant execute on function public.mcp_upsert_north_star(uuid,jsonb,jsonb) to service_role';
end $$;

-- ============================================================================
-- IDENTITY & AUTH (app_* — web only, V0.3b "web fully off Hyperdrive")
-- ----------------------------------------------------------------------------
-- Web-only identity writes that have no /mcp counterpart. SECURITY DEFINER so the
-- web (service_role over HTTPS PostgREST) can run them atomically without ever
-- opening the Hyperdrive TCP tunnel that produced the intermittent HTTP 1101 on
-- create/archive/agent/credential/login. Actors here carry source=WEB.
-- ============================================================================

-- ── auth profile mirror (runs on every protected request / login) ────────────
-- Idempotent: return the users row for this auth id, else claim an unlinked row by
-- email, else insert. Race-safe via the unique(auth_user_id) + unique(email).
create or replace function public.app_ensure_profile(
  p_auth_user_id uuid, p_email text, p_name text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.users;
begin
  select * into r from public.users where auth_user_id = p_auth_user_id limit 1;
  if r.id is not null then return to_jsonb(r); end if;

  update public.users
     set auth_user_id = p_auth_user_id,
         display_name = coalesce(display_name, p_name),
         updated_at   = now()
   where email = p_email and auth_user_id is null
  returning * into r;
  if r.id is not null then return to_jsonb(r); end if;

  insert into public.users (auth_user_id, email, display_name)
    values (p_auth_user_id, p_email, p_name)
    on conflict (auth_user_id) do nothing
  returning * into r;
  if r.id is not null then return to_jsonb(r); end if;

  -- someone else created it concurrently → reselect (by auth id, else by email).
  select * into r from public.users where auth_user_id = p_auth_user_id limit 1;
  if r.id is not null then return to_jsonb(r); end if;
  select * into r from public.users where email = p_email limit 1;
  if r.id is not null then return to_jsonb(r); end if;
  raise exception '无法建立用户档案';
end $$;

-- ── project lifecycle ───────────────────────────────────────────────────────
-- p keys: name, slug (base), description?, icon?, workspace_slug?, created_by?
create or replace function public.app_create_project(
  p jsonb, p_actor jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare ws uuid; base text; cand text; i int := 0; r public.projects;
begin
  select id into ws from public.workspaces
    where slug = coalesce(nullif(p->>'workspace_slug',''), 'personal');
  if ws is null then raise exception '工作区不存在'; end if;

  base := coalesce(nullif(p->>'slug',''), 'project');
  cand := base;
  loop
    exit when not exists (select 1 from public.projects where slug = cand);
    i := i + 1;
    cand := base || '-' || to_char(floor(extract(epoch from now()) * 1000), 'FM999999999990')
            || (case when i > 1 then '-' || i::text else '' end);
  end loop;

  insert into public.projects (workspace_id, name, slug, description, icon, created_by)
    values (ws, coalesce(nullif(p->>'name',''), '未命名项目'), cand,
            nullif(p->>'description',''), nullif(p->>'icon',''),
            nullif(p->>'created_by','')::uuid)
  returning * into r;
  perform public.mcp_log(r.id, p_actor, 'PROJECT_CREATED', 'project', r.id,
    '创建项目「'||r.name||'」', null, jsonb_build_object('name', r.name, 'slug', r.slug));
  return to_jsonb(r);
end $$;

create or replace function public.app_set_project_status(
  p_project uuid, p_status text, p_actor jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare cur public.projects; r public.projects;
begin
  select * into cur from public.projects where id = p_project and deleted_at is null;
  if cur.id is null then raise exception '项目不存在'; end if;
  update public.projects set
    status      = p_status::project_status,
    archived_at = case when p_status = 'ARCHIVED' then coalesce(archived_at, now()) else null end,
    version     = version + 1,
    updated_at  = now()
  where id = p_project returning * into r;
  perform public.mcp_log(p_project, p_actor, 'PROJECT_STATUS', 'project', p_project,
    '项目状态 '||cur.status||' → '||p_status,
    jsonb_build_object('status', cur.status::text), jsonb_build_object('status', p_status));
  return to_jsonb(r);
end $$;

-- ── agents + bindings ──────────────────────────────────────────────────────
-- p keys: name, provider?, description?, role?, permission_level
create or replace function public.app_create_agent_and_bind(
  p_project uuid, p jsonb, p_actor jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare ag public.agents; lvl permission_level;
begin
  if not exists (select 1 from public.projects where id = p_project and deleted_at is null) then
    raise exception '项目不存在';
  end if;
  lvl := coalesce(nullif(p->>'permission_level',''), 'READ')::permission_level;
  insert into public.agents (name, provider, description, role)
    values (coalesce(nullif(p->>'name',''), '未命名 Agent'), nullif(p->>'provider',''),
            nullif(p->>'description',''), nullif(p->>'role',''))
    returning * into ag;
  insert into public.project_agents (project_id, agent_id, role, permission_level)
    values (p_project, ag.id, nullif(p->>'role',''), lvl)
  on conflict (project_id, agent_id) do update
    set permission_level = excluded.permission_level, enabled = true;
  perform public.mcp_log(p_project, p_actor, 'AGENT_BOUND', 'agent', ag.id,
    '创建并绑定 Agent「'||ag.name||'」('||lvl||')', null,
    jsonb_build_object('name', ag.name, 'permissionLevel', lvl::text));
  return to_jsonb(ag);
end $$;

create or replace function public.app_bind_agent(
  p_project uuid, p_agent uuid, p_level text, p_actor jsonb
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare an text; lvl permission_level;
begin
  select name into an from public.agents where id = p_agent and deleted_at is null;
  if an is null then raise exception 'Agent 不存在'; end if;
  lvl := coalesce(nullif(p_level,''), 'READ')::permission_level;
  insert into public.project_agents (project_id, agent_id, permission_level)
    values (p_project, p_agent, lvl)
  on conflict (project_id, agent_id) do update
    set permission_level = excluded.permission_level, enabled = true;
  perform public.mcp_log(p_project, p_actor, 'AGENT_BOUND', 'agent', p_agent,
    '绑定 Agent「'||an||'」('||lvl||')', null, jsonb_build_object('name', an, 'permissionLevel', lvl::text));
end $$;

create or replace function public.app_set_agent_permission(
  p_project uuid, p_agent uuid, p_level text, p_actor jsonb
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare cur permission_level; lvl permission_level;
begin
  select permission_level into cur from public.project_agents
    where project_id = p_project and agent_id = p_agent;
  if cur is null then raise exception '绑定不存在'; end if;
  lvl := coalesce(nullif(p_level,''), cur::text)::permission_level;
  update public.project_agents set permission_level = lvl
    where project_id = p_project and agent_id = p_agent;
  perform public.mcp_log(p_project, p_actor, 'AGENT_PERMISSION', 'agent', p_agent,
    '调整 Agent 权限 '||cur||' → '||lvl,
    jsonb_build_object('permissionLevel', cur::text), jsonb_build_object('permissionLevel', lvl::text));
end $$;

create or replace function public.app_set_agent_enabled(
  p_project uuid, p_agent uuid, p_enabled boolean, p_actor jsonb
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.project_agents set enabled = p_enabled
    where project_id = p_project and agent_id = p_agent;
  perform public.mcp_log(p_project, p_actor,
    case when p_enabled then 'AGENT_ENABLED' else 'AGENT_DISABLED' end, 'agent', p_agent,
    case when p_enabled then '启用 Agent 绑定' else '停用 Agent 绑定' end, null, null);
end $$;

create or replace function public.app_unbind_agent(
  p_project uuid, p_agent uuid, p_actor jsonb
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare an text;
begin
  select a.name into an from public.project_agents pa
    join public.agents a on a.id = pa.agent_id
    where pa.project_id = p_project and pa.agent_id = p_agent;
  delete from public.project_agents where project_id = p_project and agent_id = p_agent;
  perform public.mcp_log(p_project, p_actor, 'AGENT_UNBOUND', 'agent', p_agent,
    '解绑 Agent' || coalesce('「'||an||'」',''), null, null);
end $$;

-- ── MCP credentials (token hashed app-side; only hash+prefix stored) ─────────
-- p keys: name, token_hash, token_prefix, permission_level, agent_id?, expires_at?
create or replace function public.app_create_credential(
  p_project uuid, p jsonb, p_actor jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.mcp_credentials;
begin
  if not exists (select 1 from public.projects where id = p_project and deleted_at is null) then
    raise exception '项目不存在';
  end if;
  insert into public.mcp_credentials
    (project_id, agent_id, name, token_hash, token_prefix, permission_level, expires_at)
  values (p_project, nullif(p->>'agent_id','')::uuid, coalesce(nullif(p->>'name',''), 'MCP 连接'),
          p->>'token_hash', coalesce(nullif(p->>'token_prefix',''), ''),
          coalesce(nullif(p->>'permission_level',''), 'READ')::permission_level,
          nullif(p->>'expires_at','')::timestamptz)
  returning * into r;
  -- audit the CREATION only — never the token/hash. Return a SAFE object (no token_hash).
  perform public.mcp_log(p_project, p_actor, 'MCP_CREDENTIAL_CREATED', 'mcp_credential', r.id,
    '创建 MCP 连接「'||r.name||'」('||r.permission_level||')', null,
    jsonb_build_object('permissionLevel', r.permission_level::text, 'prefix', r.token_prefix));
  return jsonb_build_object(
    'id', r.id, 'name', r.name, 'token_prefix', r.token_prefix,
    'permission_level', r.permission_level::text, 'agent_id', r.agent_id,
    'created_at', r.created_at, 'last_used_at', r.last_used_at,
    'expires_at', r.expires_at, 'revoked_at', r.revoked_at);
end $$;

create or replace function public.app_revoke_credential(
  p_id uuid, p_project uuid, p_actor jsonb
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare nm text; rv timestamptz;
begin
  select name, revoked_at into nm, rv from public.mcp_credentials
    where id = p_id and project_id = p_project;
  if nm is null then raise exception 'MCP 连接不存在'; end if;
  if rv is null then
    update public.mcp_credentials set revoked_at = now() where id = p_id;
    perform public.mcp_log(p_project, p_actor, 'MCP_CREDENTIAL_REVOKED', 'mcp_credential', p_id,
      '撤销 MCP 连接「'||nm||'」', null, null);
  end if;  -- idempotent: already revoked → no-op
end $$;

-- grants for the app_* section
do $$
declare fn text;
begin
  foreach fn in array array[
    'app_ensure_profile(uuid,text,text)',
    'app_create_project(jsonb,jsonb)',
    'app_set_project_status(uuid,text,jsonb)',
    'app_create_agent_and_bind(uuid,jsonb,jsonb)',
    'app_bind_agent(uuid,uuid,text,jsonb)',
    'app_set_agent_permission(uuid,uuid,text,jsonb)',
    'app_set_agent_enabled(uuid,uuid,boolean,jsonb)',
    'app_unbind_agent(uuid,uuid,jsonb)',
    'app_create_credential(uuid,jsonb,jsonb)',
    'app_revoke_credential(uuid,uuid,jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;
