
-- Jalankan setelah SQL V11 sukses.
alter table public.orders
  add column if not exists payment_amount bigint,
  add column if not exists unique_fee integer not null default 0,
  add column if not exists expires_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists delivery_content text,
  add column if not exists qr_content text,
  add column if not exists qr_image text,
  add column if not exists payment_raw jsonb;

update public.orders set
  payment_amount=coalesce(payment_amount,amount),
  expires_at=coalesce(expires_at,created_at+interval '10 minutes')
where payment_amount is null or expires_at is null;

create table if not exists public.stock_items(
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_name text not null,
  content text not null,
  status text not null default 'available' check(status in('available','reserved','sold')),
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  sold_at timestamptz
);
create index if not exists stock_items_lookup_idx on public.stock_items(product_id,variant_name,status);

create table if not exists public.processed_payments(
  mutation_key text primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  mutation_data jsonb,
  created_at timestamptz not null default now()
);

alter table public.stock_items enable row level security;
alter table public.processed_payments enable row level security;

drop policy if exists "admin manage stock" on public.stock_items;
create policy "admin manage stock" on public.stock_items for all to authenticated
using(exists(select 1 from public.admin_users a where a.user_id=auth.uid()))
with check(exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

revoke all on public.processed_payments from anon,authenticated;
drop policy if exists "public lookup orders by invoice" on public.orders;

create or replace function public.complete_paid_order(
  p_order_id uuid,p_mutation_key text,p_mutation_data jsonb
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_order public.orders%rowtype; v_stock public.stock_items%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status in('completed','paid','processing') then
    return jsonb_build_object('status',v_order.status,'invoice',v_order.invoice);
  end if;
  if v_order.status<>'pending' then raise exception 'ORDER_NOT_PENDING'; end if;
  if exists(select 1 from public.processed_payments where mutation_key=p_mutation_key)
    then raise exception 'PAYMENT_ALREADY_USED'; end if;

  select * into v_stock from public.stock_items
  where product_id=v_order.product_id and variant_name=v_order.variant_name and status='available'
  order by created_at asc for update skip locked limit 1;

  if not found then
    update public.orders set status='processing',paid_at=now(),
      payment_raw=coalesce(payment_raw,'{}'::jsonb)||jsonb_build_object('mutation',p_mutation_data,'delivery_error','STOCK_EMPTY'),
      updated_at=now() where id=p_order_id;
    insert into public.processed_payments values(p_mutation_key,p_order_id,p_mutation_data,now());
    return jsonb_build_object('status','processing','invoice',v_order.invoice);
  end if;

  update public.stock_items set status='sold',order_id=p_order_id,sold_at=now() where id=v_stock.id;
  update public.orders set status='completed',paid_at=now(),delivered_at=now(),
    delivery_content=v_stock.content,
    payment_raw=coalesce(payment_raw,'{}'::jsonb)||jsonb_build_object('mutation',p_mutation_data),
    updated_at=now() where id=p_order_id;
  insert into public.processed_payments values(p_mutation_key,p_order_id,p_mutation_data,now());
  update public.products set stock=greatest(stock-1,0),updated_at=now() where id=v_order.product_id;
  return jsonb_build_object('status','completed','invoice',v_order.invoice);
end $$;

revoke all on function public.complete_paid_order(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.complete_paid_order(uuid,text,jsonb) to service_role;
