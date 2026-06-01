-- WARUNK ONLINE Supabase schema
-- Jalankan file ini di Supabase SQL Editor, lalu buat user auth untuk owner/admin/kasir/customer jika dibutuhkan.
-- Setelah user dibuat, update role di tabel profiles sesuai kebutuhan.

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Warunk Staff',
  role text not null default 'customer' check (role in ('owner', 'admin', 'kasir', 'customer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.tables (
  id uuid primary key default uuid_generate_v4(),
  table_number text not null unique,
  table_name text,
  qr_slug text not null unique default encode(gen_random_bytes(8), 'hex'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.menu_items (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  description text,
  price numeric(12,2) not null check (price >= 0),
  image_url text,
  is_available boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default uuid_generate_v4(),
  table_id uuid references public.tables(id) on delete set null,
  table_number text not null,
  customer_id uuid references auth.users(id) on delete set null,
  status text not null default 'waiting_payment' check (status in ('cart_created', 'waiting_payment', 'paid', 'preparing', 'ready', 'completed', 'cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'void')),
  payment_method text not null default 'cashier_counter' check (payment_method in ('cashier_counter')),
  payment_code text not null unique,
  subtotal numeric(12,2) not null default 0,
  service_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  customer_note text,
  cashier_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  item_name_snapshot text not null,
  qty int not null check (qty > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  note text,
  subtotal numeric(12,2) not null check (subtotal >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.order_events (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  event text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings(key, value) values
('store', '{"name":"PRATAPA MART","tagline":"Kamu mau jajanan yang cepet dan ga ribet? Pesen disini aja!!","taxPercent":0,"servicePercent":0}'::jsonb)
on conflict (key) do nothing;

-- Migration-safe updates untuk versi sebelumnya.
alter table if exists public.orders add column if not exists customer_id uuid references auth.users(id) on delete set null;
do $$
begin
  alter table public.profiles drop constraint if exists profiles_role_check;
  alter table public.profiles alter column role set default 'customer';
  alter table public.profiles add constraint profiles_role_check check (role in ('owner', 'admin', 'kasir', 'customer'));
exception when others then null;
end $$;

-- Tidak ada data demo.
-- Tambahkan kategori, menu, dan meja QR secara manual dari dashboard admin/owner.

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tables_updated_at on public.tables;
create trigger tables_updated_at before update on public.tables for each row execute function public.set_updated_at();

drop trigger if exists categories_updated_at on public.categories;
create trigger categories_updated_at before update on public.categories for each row execute function public.set_updated_at();

drop trigger if exists menu_items_updated_at on public.menu_items;
create trigger menu_items_updated_at before update on public.menu_items for each row execute function public.set_updated_at();

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when new.raw_user_meta_data->>'role' in ('owner','admin','kasir','customer') then new.raw_user_meta_data->>'role' else 'customer' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create index if not exists idx_orders_created_at on public.orders(created_at desc);
create index if not exists idx_orders_customer_id on public.orders(customer_id);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_order_items_order_id on public.order_items(order_id);
create index if not exists idx_menu_items_category on public.menu_items(category_id);

alter table public.profiles enable row level security;
alter table public.tables enable row level security;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.app_settings enable row level security;

create or replace function public.current_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active = true
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role() in ('owner','admin','kasir')
$$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role() in ('owner','admin')
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role() = 'owner'
$$;

-- Public/customer read policies
create policy "Public can read active tables" on public.tables for select using (is_active = true or public.is_staff());
create policy "Public can read active categories" on public.categories for select using (is_active = true or public.is_staff());
create policy "Public can read menu" on public.menu_items for select using (is_available = true or public.is_staff());
create policy "Public can read settings" on public.app_settings for select using (true);

-- Customers can create orders and items, staff can manage them.
create policy "Public can create order" on public.orders for insert with check (customer_id is null or customer_id = auth.uid());
create policy "Public can read order by payment code" on public.orders for select using (true);
create policy "Staff can update orders" on public.orders for update using (public.is_staff()) with check (public.is_staff());

create policy "Public can create order item" on public.order_items for insert with check (true);
create policy "Public can read order item" on public.order_items for select using (true);
create policy "Staff can manage order items" on public.order_items for all using (public.is_staff()) with check (public.is_staff());

create policy "Public can create order event" on public.order_events for insert with check (true);
create policy "Public can read order events" on public.order_events for select using (true);

-- Staff dashboards
create policy "Staff read profiles" on public.profiles for select using (public.is_staff() or auth.uid() = id);
create policy "Users update own customer profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "Owner manage profiles" on public.profiles for all using (public.is_owner()) with check (public.is_owner());

create policy "Admin owner manage tables" on public.tables for all using (public.is_manager()) with check (public.is_manager());
create policy "Admin owner manage categories" on public.categories for all using (public.is_manager()) with check (public.is_manager());
create policy "Admin owner manage menu" on public.menu_items for all using (public.is_manager()) with check (public.is_manager());
create policy "Owner manage settings" on public.app_settings for all using (public.is_owner()) with check (public.is_owner());

-- Realtime publication. Abaikan error jika publication sudah ada.
do $$
begin
  begin alter publication supabase_realtime add table public.orders; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.order_items; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.order_events; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.menu_items; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.categories; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.tables; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.app_settings; exception when duplicate_object then null; end;
end $$;
