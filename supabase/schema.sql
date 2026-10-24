-- Kefu Christmas 2026: database for Supabase.
-- Run in Supabase > SQL Editor. Safe to re-run: it never drops tables or data.
--
-- Security model: the website's key is public, so every table is locked
-- (row level security on, no policies, no grants). The site can only call
-- the functions below, and each one checks the caller's session token.

create extension if not exists pgcrypto with schema extensions;

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

alter table people         enable row level security;
alter table sessions       enable row level security;
alter table teams          enable row level security;
alter table team_members   enable row level security;
alter table quiz_questions enable row level security;
alter table games          enable row level security;
alter table votes          enable row level security;

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

create or replace function register(p_name text, p_pin text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_name text := _clean_name(p_name); v_id uuid; v_token uuid;
begin
  if v_name !~ '\S+ \S+' then raise exception 'Please enter your first and last name.'; end if;
  if length(v_name) > 60 then raise exception 'That name is too long.'; end if;
  if coalesce(p_pin, '') !~ '^\d{4}$' then raise exception 'Your PIN must be 4 digits.'; end if;
  begin
    insert into people (full_name, pin_hash) values (v_name, crypt(p_pin, gen_salt('bf'))) returning id into v_id;
  exception when unique_violation then
    raise exception '% has already signed up. Choose "I''ve been here before" to log in.', v_name;
  end;
  insert into sessions (person_id) values (v_id) returning token into v_token;
  return v_token;
end $$;

-- Returns {token} or {error}. It returns instead of raising so the
-- failed-attempt counter is saved (a raise would roll it back).
create or replace function login(p_name text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p people; v_token uuid;
begin
  select * into p from people where name_key = lower(_clean_name(p_name));
  if not found then
    return jsonb_build_object('error', 'We couldn''t find that name. Check the spelling, or choose "I''m new here".');
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
  return jsonb_build_object('token', v_token);
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

create or replace function people_list(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _person(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'full_name', full_name) order by full_name) from people), '[]');
end $$;

-- ---------- teams ----------

create or replace function teams_view(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _person(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name,
      'members', coalesce((select jsonb_agg(jsonb_build_object('id', pe.id, 'full_name', pe.full_name) order by pe.full_name)
                           from team_members m join people pe on pe.id = m.person_id where m.team_id = t.id), '[]')
    ) order by t.id)
    from teams t), '[]');
end $$;

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

-- ---------- quiz ----------

create or replace function add_question(p_token uuid, p_question text, p_answer text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare p people := _person(p_token);
begin
  if length(trim(coalesce(p_question, ''))) < 5 then raise exception 'Please write a question.'; end if;
  if length(trim(coalesce(p_answer, ''))) < 1 then raise exception 'Please add the answer.'; end if;
  if length(p_question) > 500 or length(p_answer) > 200 then raise exception 'That''s a bit long. Keep it shorter.'; end if;
  insert into quiz_questions (person_id, question, answer) values (p.id, trim(p_question), trim(p_answer));
end $$;

create or replace function my_questions(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p people := _person(p_token);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'question', question, 'answer', answer) order by created_at)
                   from quiz_questions where person_id = p.id), '[]');
end $$;

create or replace function all_questions(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'question', q.question, 'answer', q.answer, 'author', pe.full_name)
                                    order by pe.full_name, q.created_at)
                   from quiz_questions q join people pe on pe.id = q.person_id), '[]');
end $$;

create or replace function delete_question(p_token uuid, p_id bigint) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare p people := _person(p_token);
begin
  delete from quiz_questions where id = p_id and (person_id = p.id or p.is_admin);
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
      select g.id, g.name, ab.full_name as added_by,
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

-- ---------- organiser tools ----------

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

revoke execute on function _person(uuid), _admin(uuid) from public, anon, authenticated;
grant execute on function
  register(text, text), login(text, text), logout(uuid), me(uuid), people_list(uuid),
  teams_view(uuid), save_teams(uuid, jsonb),
  add_question(uuid, text, text), my_questions(uuid), all_questions(uuid), delete_question(uuid, bigint),
  add_game(uuid, text), games_view(uuid), toggle_vote(uuid, bigint), delete_game(uuid, bigint),
  admin_reset_pin(uuid, uuid, text), admin_remove_person(uuid, uuid)
to anon;

-- After you've signed up on the site, make yourself the organiser
-- (change the name to yours) and run just this line:
-- update people set is_admin = true where name_key = 'josh kefu';
