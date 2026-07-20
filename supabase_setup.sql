-- KivoPay V11 — jalankan seluruh file ini di Supabase SQL Editor

create extension if not exists "pgcrypto";

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('apk-premium','sewa-bot')),
  description text not null default '',
  price bigint not null default 0 check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  image_url text,
  variants jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  invoice text not null unique,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  variant_name text,
  amount bigint not null check (amount >= 0),
  customer_name text not null,
  customer_contact text not null,
  status text not null default 'pending'
    check (status in ('pending','paid','processing','completed','cancelled')),
  payment_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;

drop policy if exists "public read active products" on public.products;
create policy "public read active products"
on public.products for select
to anon, authenticated
using (is_active = true or exists (
  select 1 from public.admin_users a where a.user_id = auth.uid()
));

drop policy if exists "admin manage products" on public.products;
create policy "admin manage products"
on public.products for all
to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

drop policy if exists "admin can read own admin row" on public.admin_users;
create policy "admin can read own admin row"
on public.admin_users for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "public create orders" on public.orders;
create policy "public create orders"
on public.orders for insert
to anon, authenticated
with check (status = 'pending');

drop policy if exists "public lookup orders by invoice" on public.orders;
create policy "public lookup orders by invoice"
on public.orders for select
to anon, authenticated
using (
  true
);

drop policy if exists "admin manage orders" on public.orders;
create policy "admin manage orders"
on public.orders for all
to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

-- Storage policies untuk bucket "keiishop".
-- Bucket sebaiknya Public ON agar foto dapat tampil di Store.
drop policy if exists "admin upload product images" on storage.objects;
create policy "admin upload product images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'keiishop'
  and exists (select 1 from public.admin_users a where a.user_id = auth.uid())
);

drop policy if exists "admin update product images" on storage.objects;
create policy "admin update product images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'keiishop'
  and exists (select 1 from public.admin_users a where a.user_id = auth.uid())
);

drop policy if exists "admin delete product images" on storage.objects;
create policy "admin delete product images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'keiishop'
  and exists (select 1 from public.admin_users a where a.user_id = auth.uid())
);

-- Setelah menjalankan SQL ini:
-- 1) Buka Authentication > Users.
-- 2) Salin UID akun admin.
-- 3) Jalankan perintah berikut dengan UID milikmu:
--
-- insert into public.admin_users(user_id)
-- values ('PASTE_UID_ADMIN_DI_SINI')
-- on conflict (user_id) do nothing;
