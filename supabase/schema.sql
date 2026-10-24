-- Kefu Christmas 2026: database for Supabase.
-- Run in Supabase > SQL Editor. Safe to re-run: it never drops tables or data.
--
-- Security model: the website's key is public, so every table is locked
-- (row level security on, no policies, no grants). The site can only call
-- the functions below, and each one checks the caller's session token.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions; -- levenshtein() for "did you mean"

-- ---------- tables ----------

create table if not exists people (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  name_key      text generated always as (lower(regexp_replace(trim(full_name), '\s+', ' ', 'g'))) stored unique,
  pin_hash      text not null,
  is_admin      boolean not null default false,
  failed_logins int not null default 0,
  locked_until  timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists sessions (
  token      uuid primary key default gen_random_uuid(),
  person_id  uuid not null references people on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists teams (
  id   serial primary key,
  name text not null
);

create table if not exists team_members (
  team_id   int  not null references teams on delete cascade,
  person_id uuid not null unique references people on delete cascade,
  primary key (team_id, person_id)
);

create table if not exists quiz_questions (
  id         bigserial primary key,
  person_id  uuid not null references people on delete cascade,
  question   text not null,
  answer     text not null,
  created_at timestamptz not null default now()
);

create table if not exists games (
  id         bigserial primary key,
  name       text not null,
  added_by   uuid references people on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists games_name_key on games (lower(trim(name)));

create table if not exists votes (
  person_id uuid   not null references people on delete cascade,
  game_id   bigint not null references games on delete cascade,
  primary key (person_id, game_id)
);

-- ---------- v2: guest list, partners, spin wheel, multiple choice, game guides ----------

-- A guest pre-loaded by the organiser has no PIN until they sign up.
alter table people alter column pin_hash drop not null;
alter table people add column if not exists partner_id uuid references people on delete set null;
-- v3: other ways someone might type their name, lowercased ("liv kefu", "joshua kefu", "nate allen").
alter table people add column if not exists aliases text[] not null default '{}';

-- Teams are drawn in secret; each person's spin reveals their own team.
alter table team_members add column if not exists revealed    boolean not null default false;
alter table team_members add column if not exists revealed_at timestamptz;

-- kind: 'tf' (options ["True","False"]) or 'mc' (4 options). correct = index into options.
alter table quiz_questions add column if not exists kind    text not null default 'mc';
alter table quiz_questions add column if not exists options jsonb;
alter table quiz_questions add column if not exists correct int;
alter table quiz_questions add column if not exists photo   text; -- data:image/jpeg;base64,...

alter table games add column if not exists slug        text; -- picks the illustration for built-in games
alter table games add column if not exists description text;
alter table games add column if not exists steps       jsonb;

-- v4: quiz night. One row holds where the TV quiz is up to; scores are per team.
create table if not exists quiz_night (
  id           int primary key default 1 check (id = 1),
  question_ids jsonb not null default '[]',
  idx          int not null default 0,
  revealed     boolean not null default false,
  updated_at   timestamptz not null default now()
);
create table if not exists quiz_scores (
  team_id int primary key references teams on delete cascade,
  points  int not null default 0
);

-- v5: Bauble Pong knockout. seeds = team ids in bracket order; results = {"<round>-<match>": winner team id}.
create table if not exists tournament (
  id         int primary key default 1 check (id = 1),
  seeds      jsonb not null default '[]',
  results    jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table people         enable row level security;
alter table sessions       enable row level security;
alter table teams          enable row level security;
alter table team_members   enable row level security;
alter table quiz_questions enable row level security;
alter table games          enable row level security;
alter table votes          enable row level security;
alter table quiz_night     enable row level security;
alter table quiz_scores    enable row level security;
alter table tournament     enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------- internal helpers ----------

create or replace function _person(p_token uuid) returns people
language plpgsql security definer set search_path = public, extensions as $$
declare p people;
begin
  select pe.* into p from sessions s join people pe on pe.id = s.person_id where s.token = p_token;
  if not found then raise exception 'Please log in again.'; end if;
  return p;
end $$;

create or replace function _admin(p_token uuid) returns people
language plpgsql security definer set search_path = public, extensions as $$
declare p people := _person(p_token);
begin
  if not p.is_admin then raise exception 'Only the organiser can do that.'; end if;
  return p;
end $$;

create or replace function _clean_name(p_name text) returns text
language sql immutable as $$
  select regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g')
$$;

-- ---------- sign up / log in ----------

-- Finds a guest by full name, a nickname, or a first name that only one guest has.
-- Returns a row of nulls when there's no single clear match.
create or replace function _find_person(p_name text) returns people
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_key text := lower(_clean_name(p_name)); p people; n int;
begin
  select * into p from people where name_key = v_key;
  if found then return p; end if;
  select count(*) into n from people where v_key = any(aliases);
  if n = 1 then
    select * into p from people where v_key = any(aliases);
    return p;
  end if;
  if v_key <> '' and v_key !~ ' ' then
    select count(*) into n from people
    where split_part(name_key, ' ', 1) = v_key or exists (select 1 from unnest(aliases) a where split_part(a, ' ', 1) = v_key);
    if n = 1 then
      select * into p from people
      where split_part(name_key, ' ', 1) = v_key or exists (select 1 from unnest(aliases) a where split_part(a, ' ', 1) = v_key);
      return p;
    end if;
  end if;
  return p; -- all nulls
end $$;

-- Up to three guest names close to what was typed, closest first.
create or replace function _suggest(p_name text) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  with i as (
    select k, split_part(k, ' ', 1) as f, regexp_replace(k, '^.* ', '') as l
    from (select lower(_clean_name(p_name)) as k) x
  ), scored as (
    select pe.full_name,
           least(levenshtein(i.k, pe.name_key),
                 coalesce((select min(levenshtein(i.k, a)) from unnest(pe.aliases) a), 99)) as d,
           (i.k ~ ' ' and levenshtein(i.l, regexp_replace(pe.name_key, '^.* ', '')) <= 1
                      and left(i.f, 1) = left(pe.name_key, 1)) as same_family,
           (split_part(pe.name_key, ' ', 1) = i.f
              or exists (select 1 from unnest(pe.aliases) a where split_part(a, ' ', 1) = i.f)) as same_first
    from people pe, i
    where i.k <> ''
  )
  select coalesce(jsonb_agg(full_name order by d), '[]')
  from (select full_name, d from scored where d <= 3 or same_family or same_first order by d limit 3) s
$$;

drop function if exists register(text, text); -- return type changed in v3

-- Signing up claims your spot on the guest list and sets your PIN.
-- Returns {token, full_name} or {error, suggestions}.
create or replace function register(p_name text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_name text := _clean_name(p_name); p people := _find_person(p_name); v_token uuid;
begin
  if v_name = '' then return jsonb_build_object('error', 'Please enter your name.'); end if;
  if p.id is null then
    return jsonb_build_object('error', format('We couldn''t find "%s" on the guest list.', v_name), 'suggestions', _suggest(p_name));
  end if;
  if p.pin_hash is not null then
    return jsonb_build_object('error', format('%s has already signed up. Choose "I''ve been here before" to log in.', p.full_name));
  end if;
  if coalesce(p_pin, '') !~ '^\d{4}$' then return jsonb_build_object('error', 'Your PIN must be 4 digits.'); end if;
  update people set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p.id;
  insert into sessions (person_id) values (p.id) returning token into v_token;
  return jsonb_build_object('token', v_token, 'full_name', p.full_name);
end $$;

-- Returns {token, full_name} or {error, suggestions?}. It returns instead of raising
-- so the failed-attempt counter is saved (a raise would roll it back).
create or replace function login(p_name text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p people := _find_person(p_name); v_token uuid;
begin
  if p.id is null then
    return jsonb_build_object('error', 'We couldn''t find that name.', 'suggestions', _suggest(p_name));
  end if;
  if p.pin_hash is null then
    return jsonb_build_object('error', format('%s hasn''t chosen a PIN yet. Choose "I''m new here" to set one.', p.full_name));
  end if;
  if p.locked_until > now() then
    return jsonb_build_object('error', 'Too many wrong PINs. Wait 10 minutes, or ask the organiser to reset your PIN.');
  end if;
  if crypt(coalesce(p_pin, ''), p.pin_hash) <> p.pin_hash then
    update people set
      failed_logins = case when failed_logins + 1 >= 5 then 0 else failed_logins + 1 end,
      locked_until  = case when failed_logins + 1 >= 5 then now() + interval '10 minutes' end
    where id = p.id;
    return jsonb_build_object('error', 'That PIN doesn''t match. Try again.');
  end if;
  update people set failed_logins = 0, locked_until = null where id = p.id;
  insert into sessions (person_id) values (p.id) returning token into v_token;
  return jsonb_build_object('token', v_token, 'full_name', p.full_name);
end $$;

create or replace function logout(p_token uuid) returns void
language sql security definer set search_path = public as $$
  delete from sessions where token = p_token
$$;

create or replace function me(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p people := _person(p_token);
begin
  return jsonb_build_object('id', p.id, 'full_name', p.full_name, 'is_admin', p.is_admin);
end $$;

-- Everyone on the guest list. Never says which hidden team someone is in.
create or replace function people_list(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _person(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', pe.id, 'full_name', pe.full_name, 'partner_id', pe.partner_id,
      'signed_up', pe.pin_hash is not null,
      'in_draw', m.person_id is not null,
      'spun', coalesce(m.revealed, false)
    ) order by pe.full_name)
    from people pe left join team_members m on m.person_id = pe.id), '[]');
end $$;

-- ---------- teams and the spin wheel ----------

-- {in_draw, my_team, teams: [{id, name, size, members (revealed only)}]}
create or replace function teams_view(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p people := _person(p_token); v_team int; v_revealed boolean;
begin
  select team_id, revealed into v_team, v_revealed from team_members where person_id = p.id;
  return jsonb_build_object(
    'in_draw', v_team is not null,
    'my_team', case when v_revealed then v_team end,
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name,
        'size', (select count(*) from team_members m where m.team_id = t.id),
        'members', coalesce((select jsonb_agg(jsonb_build_object('id', pe.id, 'full_name', pe.full_name) order by m.revealed_at)
                             from team_members m join people pe on pe.id = m.person_id
                             where m.team_id = t.id and m.revealed), '[]')
      ) order by t.id)
      from teams t), '[]'));
end $$;

-- Organiser saves a secret draw. Replaces any earlier draw and its spins.
-- p_teams: [{"name": "Tinsel", "members": ["<person uuid>", ...]}, ...]
create or replace function save_teams(p_token uuid, p_teams jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_team jsonb; v_id int;
begin
  perform _admin(p_token);
  delete from teams where true;
  for v_team in select * from jsonb_array_elements(p_teams) loop
    insert into teams (name) values (v_team->>'name') returning id into v_id;
    insert into team_members (team_id, person_id)
      select v_id, x::uuid from jsonb_array_elements_text(v_team->'members') x;
  end loop;
end $$;

-- Reveals the caller's own team. Spinning twice just shows the same team.
create or replace function spin(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p people := _person(p_token); v_team int;
begin
  update team_members set revealed = true, revealed_at = coalesce(revealed_at, now())
  where person_id = p.id returning team_id into v_team;
  if v_team is null then raise exception 'You''re not in the draw yet. Ask the organiser to add you.'; end if;
  return jsonb_build_object('team_id', v_team, 'name', (select name from teams where id = v_team));
end $$;

-- End of November: reveal everyone who hasn't spun.
create or replace function admin_reveal_all(p_token uuid) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  perform _admin(p_token);
  update team_members set revealed = true, revealed_at = now() where not revealed;
  get diagnostics n = row_count;
  return n;
end $$;

-- Late addition: put someone into the smallest team that doesn't have their partner.
create or replace function admin_place_person(p_token uuid, p_person_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_partner uuid; v_team int;
begin
  perform _admin(p_token);
  if exists (select 1 from team_members where person_id = p_person_id) then raise exception 'They''re already in the draw.'; end if;
  select partner_id into v_partner from people where id = p_person_id;
  select t.id into v_team from teams t
  where not exists (select 1 from team_members m where m.team_id = t.id and m.person_id = v_partner)
  order by (select count(*) from team_members m where m.team_id = t.id), random()
  limit 1;
  if v_team is null then raise exception 'Set up the draw first.'; end if;
  insert into team_members (team_id, person_id) values (v_team, p_person_id);
end $$;

-- ---------- quiz ----------

drop function if exists add_question(uuid, text, text); -- v1 signature

create or replace function add_question(p_token uuid, p_kind text, p_question text, p_options jsonb, p_correct int, p_photo text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare p people := _person(p_token); v_opts jsonb;
begin
  if length(trim(coalesce(p_question, ''))) < 5 then raise exception 'Please write a question.'; end if;
  if length(p_question) > 500 then raise exception 'That question is a bit long. Keep it under 500 characters.'; end if;
  if p_kind = 'tf' then
    v_opts := '["True", "False"]';
  elsif p_kind = 'mc' then
    if jsonb_typeof(p_options) is distinct from 'array' or jsonb_array_length(p_options) <> 4 then
      raise exception 'Fill in all four choices.';
    end if;
    select jsonb_agg(trim(x.v) order by x.n) into v_opts from jsonb_array_elements_text(p_options) with ordinality as x(v, n);
    if exists (select 1 from jsonb_array_elements_text(v_opts) o where length(o) = 0 or length(o) > 120) then
      raise exception 'Fill in all four choices (each under 120 characters).';
    end if;
  else
    raise exception 'Choose True / False or Multiple choice.';
  end if;
  if p_correct is null or p_correct < 0 or p_correct >= jsonb_array_length(v_opts) then
    raise exception 'Tick which answer is correct.';
  end if;
  if p_photo is not null and (length(p_photo) > 700000 or p_photo !~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$') then
    raise exception 'That photo couldn''t be used. Try a different one.';
  end if;
  insert into quiz_questions (person_id, question, answer, kind, options, correct, photo)
  values (p.id, trim(p_question), v_opts->>p_correct, p_kind, v_opts, p_correct, p_photo);
end $$;

create or replace function my_questions(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p people := _person(p_token);
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
                     'id', id, 'kind', kind, 'question', question, 'answer', answer,
                     'options', options, 'correct', correct, 'photo', photo) order by created_at)
                   from quiz_questions where person_id = p.id), '[]');
end $$;

create or replace function all_questions(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object(
                     'id', q.id, 'kind', q.kind, 'question', q.question, 'answer', q.answer,
                     'options', q.options, 'correct', q.correct, 'photo', q.photo,
                     'author', pe.full_name, 'author_id', pe.id)
                     order by pe.full_name, q.created_at)
                   from quiz_questions q join people pe on pe.id = q.person_id), '[]');
end $$;

create or replace function delete_question(p_token uuid, p_id bigint) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare p people := _person(p_token);
begin
  delete from quiz_questions where id = p_id and (person_id = p.id or p.is_admin);
end $$;

-- ---------- quiz night (TV screen) ----------

create or replace function quiz_night_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_token);
  return coalesce((select jsonb_build_object('question_ids', question_ids, 'idx', idx, 'revealed', revealed)
                   from quiz_night where id = 1),
                  jsonb_build_object('question_ids', '[]'::jsonb, 'idx', 0, 'revealed', false));
end $$;

create or replace function quiz_night_set(p_token uuid, p_question_ids jsonb, p_idx int, p_revealed boolean) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_token);
  insert into quiz_night (id, question_ids, idx, revealed, updated_at)
  values (1, coalesce(p_question_ids, '[]'), coalesce(p_idx, 0), coalesce(p_revealed, false), now())
  on conflict (id) do update set question_ids = excluded.question_ids, idx = excluded.idx,
                                 revealed = excluded.revealed, updated_at = now();
end $$;

-- Everyone can see the scoreboard. [{team_id, name, points}], highest first.
create or replace function quiz_scores_view(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _person(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('team_id', t.id, 'name', t.name, 'points', coalesce(s.points, 0))
                                    order by coalesce(s.points, 0) desc, t.id)
                   from teams t left join quiz_scores s on s.team_id = t.id), '[]');
end $$;

create or replace function quiz_score_add(p_token uuid, p_team_id int, p_delta int) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare v int;
begin
  perform _admin(p_token);
  insert into quiz_scores (team_id, points) values (p_team_id, greatest(0, p_delta))
  on conflict (team_id) do update set points = greatest(0, quiz_scores.points + p_delta)
  returning points into v;
  return v;
end $$;

create or replace function quiz_scores_reset(p_token uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_token);
  delete from quiz_scores where true;
end $$;

-- ---------- games ----------

create or replace function add_game(p_token uuid, p_name text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare p people := _person(p_token); v_name text := _clean_name(p_name);
begin
  if length(v_name) < 2 or length(v_name) > 60 then raise exception 'Please give the game a name.'; end if;
  begin
    insert into games (name, added_by) values (v_name, p.id);
  exception when unique_violation then
    raise exception '% is already on the list. Vote for it instead.', v_name;
  end;
end $$;

create or replace function games_view(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p people := _person(p_token);
begin
  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.votes desc, r.name)
    from (
      select g.id, g.name, g.slug, g.description, g.steps, ab.full_name as added_by,
             count(v.person_id) as votes,
             coalesce(bool_or(v.person_id = p.id), false) as mine,
             coalesce(jsonb_agg(pe.full_name order by pe.full_name) filter (where pe.id is not null), '[]') as voters,
             (g.added_by = p.id or p.is_admin) as can_delete
      from games g
      left join votes v   on v.game_id = g.id
      left join people pe on pe.id = v.person_id
      left join people ab on ab.id = g.added_by
      group by g.id, ab.full_name
    ) r), '[]');
end $$;

create or replace function toggle_vote(p_token uuid, p_game_id bigint) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare p people := _person(p_token);
begin
  delete from votes where person_id = p.id and game_id = p_game_id;
  if not found then insert into votes (person_id, game_id) values (p.id, p_game_id); end if;
end $$;

create or replace function delete_game(p_token uuid, p_id bigint) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare p people := _person(p_token);
begin
  delete from games where id = p_id and (added_by = p.id or p.is_admin);
end $$;

-- The built-in game (adults only). Re-running skips it if it's already there.
insert into games (name, slug, description, steps) values
('Bauble Pong', 'bauble-pong', 'Team-against-team beer pong with a festive twist.',
 '["Set up six cups in a triangle at each end of the table.",
   "Teams take turns throwing a ping-pong ball (or an unbreakable bauble) at the other side''s cups.",
   "Land one and the other team drinks that cup and takes it away.",
   "First team to clear the other side''s cups wins."]')
on conflict do nothing;

-- v5: only Bauble Pong stays from the original eight built-in games.
delete from games where slug in ('twelve-drinks', 'ring-of-fire', 'flip-cup', 'movie', 'never', 'santa-says', 'most-likely');

-- ---------- Bauble Pong tournament ----------

create or replace function tournament_view(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _person(p_token);
  return jsonb_build_object(
    'seeds',   coalesce((select seeds from tournament where id = 1), '[]'),
    'results', coalesce((select results from tournament where id = 1), '{}'),
    'teams',   coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by id) from teams), '[]'));
end $$;

create or replace function tournament_set(p_token uuid, p_seeds jsonb, p_results jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_token);
  insert into tournament (id, seeds, results, updated_at)
  values (1, coalesce(p_seeds, '[]'), coalesce(p_results, '{}'), now())
  on conflict (id) do update set seeds = excluded.seeds, results = excluded.results, updated_at = now();
end $$;

-- ---------- organiser tools ----------

create or replace function admin_add_guest(p_token uuid, p_name text, p_partner_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_name text := _clean_name(p_name); v_id uuid;
begin
  perform _admin(p_token);
  if v_name !~ '\S+ \S+' then raise exception 'Please enter their first and last name.'; end if;
  if length(v_name) > 60 then raise exception 'That name is too long.'; end if;
  begin
    insert into people (full_name, partner_id) values (v_name, p_partner_id) returning id into v_id;
  exception when unique_violation then
    raise exception '% is already on the guest list.', v_name;
  end;
  if p_partner_id is not null then update people set partner_id = v_id where id = p_partner_id; end if;
end $$;

create or replace function admin_reset_pin(p_token uuid, p_person_id uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_token);
  if coalesce(p_pin, '') !~ '^\d{4}$' then raise exception 'The new PIN must be 4 digits.'; end if;
  update people set pin_hash = crypt(p_pin, gen_salt('bf')), failed_logins = 0, locked_until = null where id = p_person_id;
  delete from sessions where person_id = p_person_id;
end $$;

create or replace function admin_remove_person(p_token uuid, p_person_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare p people := _admin(p_token);
begin
  if p_person_id = p.id then raise exception 'You can''t remove yourself.'; end if;
  delete from people where id = p_person_id;
end $$;

-- ---------- who may call what ----------

revoke execute on function _person(uuid), _admin(uuid), _find_person(text), _suggest(text) from public, anon, authenticated;
grant execute on function
  register(text, text), login(text, text), logout(uuid), me(uuid), people_list(uuid),
  teams_view(uuid), save_teams(uuid, jsonb), spin(uuid), admin_reveal_all(uuid), admin_place_person(uuid, uuid),
  add_question(uuid, text, text, jsonb, int, text), my_questions(uuid), all_questions(uuid), delete_question(uuid, bigint),
  add_game(uuid, text), games_view(uuid), toggle_vote(uuid, bigint), delete_game(uuid, bigint),
  admin_add_guest(uuid, text, uuid), admin_reset_pin(uuid, uuid, text), admin_remove_person(uuid, uuid),
  quiz_night_get(uuid), quiz_night_set(uuid, jsonb, int, boolean), quiz_scores_view(uuid),
  quiz_score_add(uuid, int, int), quiz_scores_reset(uuid),
  tournament_view(uuid), tournament_set(uuid, jsonb, jsonb)
to anon;
