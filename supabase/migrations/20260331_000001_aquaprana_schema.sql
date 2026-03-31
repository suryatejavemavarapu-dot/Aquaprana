create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null references auth.users(id) on delete cascade,
  phone text,
  full_name text,
  state text,
  district text,
  language text default 'English',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.ponds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  area_acres numeric,
  depth_ft numeric,
  latitude numeric,
  longitude numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.crop_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pond_id uuid not null references public.ponds(id) on delete cascade,
  species text not null,
  species_category text,
  stocking_density numeric not null,
  stocking_date date not null,
  harvest_window_start date not null,
  harvest_window_end date not null,
  status text not null default 'active',
  notes text,
  outcome text,
  harvest_weight_kg numeric,
  actual_harvest_date date,
  failure_reason text,
  fcr numeric,
  survival_rate numeric,
  closed_at date,
  report_generated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.pond_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pond_id uuid not null references public.ponds(id) on delete cascade,
  cycle_id uuid not null references public.crop_cycles(id) on delete cascade,
  observed_at timestamptz not null,
  param_source text default 'manual',
  do_mgl numeric,
  ph numeric,
  temp_c numeric,
  salinity_ppt numeric,
  ammonia_mgl numeric,
  turbidity_cm numeric,
  calcium_mgl numeric,
  magnesium_mgl numeric,
  potassium_mgl numeric,
  feed_qty_kg numeric,
  feed_brand text,
  mortality_count integer,
  treatment text,
  abw_g numeric,
  biomass_kg numeric,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.feeding_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pond_id uuid not null references public.ponds(id) on delete cascade,
  cycle_id uuid not null references public.crop_cycles(id) on delete cascade,
  feeds_per_day integer not null default 4,
  feed_times text[] not null default array['06:00','10:00','14:00','18:00'],
  initial_daily_qty_kg numeric not null default 0,
  interval_rule text not null default 'fixed',
  feed_rate_pct numeric not null default 2.5,
  default_brand text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (cycle_id)
);

create table if not exists public.price_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  feed_price_per_kg numeric not null default 0,
  seed_price_per_thousand numeric not null default 0,
  labour_cost_per_day numeric not null default 0,
  treatment_prices jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_name text not null,
  unit text not null,
  current_qty numeric not null default 0,
  restock_threshold numeric not null default 0,
  restock_qty numeric,
  location text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.inventory_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  quantity numeric not null,
  status text not null default 'pending',
  requested_at timestamptz not null default timezone('utc', now()),
  fulfilled_at timestamptz
);

create table if not exists public.aquagpt_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pond_id uuid not null references public.ponds(id) on delete cascade,
  cycle_id uuid references public.crop_cycles(id) on delete set null,
  language text default 'English',
  model text default 'gpt-4o',
  token_count_total integer default 0,
  message_count integer default 0,
  created_at timestamptz not null default timezone('utc', now()),
  last_active_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.aquagpt_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.aquagpt_sessions(id) on delete cascade,
  role text not null,
  content text not null,
  token_count integer,
  latency_ms integer,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.aquagpt_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  message_count integer not null default 0,
  total_tokens integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, usage_date)
);

create index if not exists ponds_user_id_idx on public.ponds(user_id);
create index if not exists crop_cycles_user_id_idx on public.crop_cycles(user_id);
create index if not exists crop_cycles_pond_id_idx on public.crop_cycles(pond_id);
create index if not exists pond_logs_user_id_idx on public.pond_logs(user_id);
create index if not exists pond_logs_cycle_id_idx on public.pond_logs(cycle_id);
create index if not exists feeding_schedules_user_id_idx on public.feeding_schedules(user_id);
create index if not exists inventory_items_user_id_idx on public.inventory_items(user_id);
create index if not exists aquagpt_sessions_user_id_idx on public.aquagpt_sessions(user_id);
create index if not exists aquagpt_messages_user_id_idx on public.aquagpt_messages(user_id);
create index if not exists aquagpt_usage_user_id_idx on public.aquagpt_usage(user_id);

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at before update on public.users for each row execute function public.set_updated_at();

drop trigger if exists set_ponds_updated_at on public.ponds;
create trigger set_ponds_updated_at before update on public.ponds for each row execute function public.set_updated_at();

drop trigger if exists set_crop_cycles_updated_at on public.crop_cycles;
create trigger set_crop_cycles_updated_at before update on public.crop_cycles for each row execute function public.set_updated_at();

drop trigger if exists set_pond_logs_updated_at on public.pond_logs;
create trigger set_pond_logs_updated_at before update on public.pond_logs for each row execute function public.set_updated_at();

drop trigger if exists set_feeding_schedules_updated_at on public.feeding_schedules;
create trigger set_feeding_schedules_updated_at before update on public.feeding_schedules for each row execute function public.set_updated_at();

drop trigger if exists set_price_configs_updated_at on public.price_configs;
create trigger set_price_configs_updated_at before update on public.price_configs for each row execute function public.set_updated_at();

drop trigger if exists set_inventory_items_updated_at on public.inventory_items;
create trigger set_inventory_items_updated_at before update on public.inventory_items for each row execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.ponds enable row level security;
alter table public.crop_cycles enable row level security;
alter table public.pond_logs enable row level security;
alter table public.feeding_schedules enable row level security;
alter table public.price_configs enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_orders enable row level security;
alter table public.aquagpt_sessions enable row level security;
alter table public.aquagpt_messages enable row level security;
alter table public.aquagpt_usage enable row level security;

drop policy if exists users_policy on public.users;
create policy users_policy on public.users for all using (auth.uid() = auth_user_id) with check (auth.uid() = auth_user_id);

drop policy if exists ponds_policy on public.ponds;
create policy ponds_policy on public.ponds for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists crop_cycles_policy on public.crop_cycles;
create policy crop_cycles_policy on public.crop_cycles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists pond_logs_policy on public.pond_logs;
create policy pond_logs_policy on public.pond_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists feeding_schedules_policy on public.feeding_schedules;
create policy feeding_schedules_policy on public.feeding_schedules for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists price_configs_policy on public.price_configs;
create policy price_configs_policy on public.price_configs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists inventory_items_policy on public.inventory_items;
create policy inventory_items_policy on public.inventory_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists inventory_orders_policy on public.inventory_orders;
create policy inventory_orders_policy on public.inventory_orders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists aquagpt_sessions_policy on public.aquagpt_sessions;
create policy aquagpt_sessions_policy on public.aquagpt_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists aquagpt_messages_policy on public.aquagpt_messages;
create policy aquagpt_messages_policy on public.aquagpt_messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists aquagpt_usage_policy on public.aquagpt_usage;
create policy aquagpt_usage_policy on public.aquagpt_usage for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
