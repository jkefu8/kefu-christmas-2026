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

-- ---------- v2: guest list, partners, spin wheel, multiple choice, game guides ----------

-- A guest pre-loaded by the organiser has no PIN until they sign up.
alter table people alter column pin_hash drop not null;
alter table people add column if not exists partner_id uuid references people on delete set null;

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

-- Signing up claims your spot on the guest list and sets your PIN.
create or replace function register(p_name text, p_pin text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_name text := _clean_name(p_name); p people; v_token uuid;
begin
  if v_name = '' then raise exception 'Please enter your full name.'; end if;
  if coalesce(p_pin, '') !~ '^\d{4}$' then raise exception 'Your PIN must be 4 digits.'; end if;
  select * into p from people where name_key = lower(v_name);
  if not found then
    raise exception '% isn''t on the guest list. Check the spelling, or ask the organiser to add you.', v_name;
  end if;
  if p.pin_hash is not null then
    raise exception '% has already signed up. Choose "I''ve been here before" to log in.', p.full_name;
  end if;
  update people set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p.id;
  insert into sessions (person_id) values (p.id) returning token into v_token;
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
    return jsonb_build_object('error', 'We couldn''t find that name. Check the spelling.');
  end if;
  if p.pin_hash is null then
    return jsonb_build_object('error', 'You haven''t chosen a PIN yet. Choose "I''m new here" to set one.');
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
                     'options', q.options, 'correct', q.correct, 'photo', q.photo, 'author', pe.full_name)
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

-- Built-in Christmas drinking games (adults only). Re-running skips any already there.
insert into games (name, slug, description, steps) values
('Twelve Drinks of Christmas', 'twelve-drinks', 'A memory chain that gets harder every round.',
 '["Sit in a circle. The first person sings \"On the first day of Christmas my true love gave to me…\" and adds an item.",
   "The next person repeats the whole list in order, then adds one more.",
   "Forget an item or mix up the order and you drink. The chain restarts with the next person.",
   "Whoever makes it to twelve picks someone to finish their drink."]'),
('Bauble Pong', 'bauble-pong', 'Team-against-team beer pong with a festive twist.',
 '["Set up six cups in a triangle at each end of the table.",
   "Teams take turns throwing a ping-pong ball (or an unbreakable bauble) at the other side''s cups.",
   "Land one and the other team drinks that cup and takes it away.",
   "First team to clear the other side''s cups wins."]'),
('Christmas Ring of Fire', 'ring-of-fire', 'Every card has a rule. Don''t be the one who draws the last King.',
 '["Spread a deck face-down in a circle around a big empty cup.",
   "Take turns drawing a card: 2 pick someone to drink, 3 you drink, 4 everyone wearing red drinks, 5 sing a carol line or drink, 7 last hand up drinks, J make a rule.",
   "Every King: pour some of your drink into the centre cup.",
   "Whoever draws the fourth King drinks the centre cup."]'),
('Flip Cup Relay', 'flip-cup', 'A drinking race between teams.',
 '["Teams line up on opposite sides of a table, each player with a small drink.",
   "On \"Go\" the first player drinks, puts the cup on the table edge and flips it upside down with one finger.",
   "Only when it lands upside down can the next teammate start.",
   "First team to flip every cup wins."]'),
('Christmas Movie Drinking Game', 'movie', 'Watch a classic and drink on your team''s triggers.',
 '["Vote for the film: Home Alone, Elf or Love Actually.",
   "Each team gets a trigger, like \"Keviiin!\", Buddy eating sugar, or anyone saying \"Christmas\".",
   "Drink every time your trigger happens.",
   "Swap triggers halfway through."]'),
('Never Have I Ever: Christmas Edition', 'never', 'Confess your festive sins.',
 '["Everyone holds up five fingers.",
   "Take turns saying \"Never have I ever…\" with something Christmassy, like \"…regifted a present\".",
   "Anyone who has done it puts a finger down and drinks.",
   "Last person with fingers still up wins."]'),
('Santa Says', 'santa-says', 'Simon Says, but Santa is in charge and mistakes cost a sip.',
 '["One person wears the Santa hat and gives commands.",
   "Only obey commands that start with \"Santa says…\".",
   "Move when you shouldn''t, or miss a real command, and you drink.",
   "The last one standing becomes the next Santa."]'),
('Who''s Most Likely To', 'most-likely', 'Point at whoever fits best. Fingers on you means sips for you.',
 '["Someone reads out \"Who''s most likely to…\", like \"…burn the turkey\".",
   "On three, everyone points at one person.",
   "Drink once for every finger pointing at you.",
   "Whoever got the most fingers reads the next one."]')
on conflict do nothing;

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

revoke execute on function _person(uuid), _admin(uuid) from public, anon, authenticated;
grant execute on function
  register(text, text), login(text, text), logout(uuid), me(uuid), people_list(uuid),
  teams_view(uuid), save_teams(uuid, jsonb), spin(uuid), admin_reveal_all(uuid), admin_place_person(uuid, uuid),
  add_question(uuid, text, text, jsonb, int, text), my_questions(uuid), all_questions(uuid), delete_question(uuid, bigint),
  add_game(uuid, text), games_view(uuid), toggle_vote(uuid, bigint), delete_game(uuid, bigint),
  admin_add_guest(uuid, text, uuid), admin_reset_pin(uuid, uuid, text), admin_remove_person(uuid, uuid)
to anon;
