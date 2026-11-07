-- TRAS: shared Stable waiting area, clearer room names, a few more rooms.
-- Run once in the Supabase SQL Editor. It is safe to run twice.
-- It keeps every existing room row (and so every allocation that points to it).

begin;

-- 1. How many patients a room holds. Normal rooms hold 1; the waiting area holds more.
alter table room add column if not exists capacity integer not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'room_capacity_at_least_one') then
    alter table room add constraint room_capacity_at_least_one check (capacity >= 1);
  end if;
end $$;

-- 2. Clearer names for the single rooms: Resus 1, Resus 2 / Treatment 1... / Obs 1, Obs 2...
--    Two steps, so a unique constraint on the name never sees two rooms with the same name.
update room set name = 'tmp-' || id where capacity = 1;

update room r
set name = case n.room_type
             when 'resus'       then 'Resus '       || n.pos
             when 'observation' then 'Obs '         || n.pos
             when 'general'     then 'Treatment '   || n.pos
             else initcap(n.room_type) || ' '       || n.pos
           end
from (
  select id, room_type::text as room_type,
         row_number() over (partition by room_type order by id) as pos
  from room
  where capacity = 1
) n
where r.id = n.id;

-- 3. Add rooms up to: 2 resus, 4 treatment, 2 observation (only the ones that are missing).
insert into room (name, room_type, status, capacity)
select 'Resus ' || n, 'resus', 'free', 1
from generate_series(1, 2) n
where not exists (select 1 from room where name = 'Resus ' || n);

insert into room (name, room_type, status, capacity)
select 'Treatment ' || n, 'general', 'free', 1
from generate_series(1, 4) n
where not exists (select 1 from room where name = 'Treatment ' || n);

insert into room (name, room_type, status, capacity)
select 'Obs ' || n, 'observation', 'free', 1
from generate_series(1, 2) n
where not exists (select 1 from room where name = 'Obs ' || n);

-- 4. The shared waiting area for Stable patients (10 places).
insert into room (name, room_type, status, capacity)
select 'Stable Waiting Area', 'general', 'free', 10
where not exists (select 1 from room where name = 'Stable Waiting Area');

commit;

-- Check the result:
select id, name, room_type, status, capacity from room order by capacity, room_type, id;
