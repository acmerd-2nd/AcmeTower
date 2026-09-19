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
-- The web app does NOT use these; it keeps Drizzle/Hyperdrive. Only /mcp calls
-- them (via lib/mcp/rest.ts → restRpc).
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
