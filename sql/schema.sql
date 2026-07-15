-- ============================================================
-- Catálogo de Fotos - Loja de Roupas
-- Schema Supabase (rode isto no SQL Editor do seu projeto)
-- ============================================================

-- extensão para gerar uuid (já vem habilitada na maioria dos projetos)
create extension if not exists "pgcrypto";

-- ---------- CATEGORIAS ----------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

-- ---------- PRODUTOS ----------
create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ref_fabrica text,                -- referência do fabricante/fornecedor (uso interno)
  ref_loja text,                   -- referência da loja (aparece pro cliente no site)
  description text,
  price numeric(10,2),
  category_id uuid references categories(id) on delete set null,
  sizes text[] default '{}',      -- ex: {"P","M","G"}
  colors text[] default '{}',     -- ex: {"Preto","Branco"}
  active boolean default true,    -- desativa sem apagar
  promocao boolean not null default false,  -- exibe selo "Promoção" e entra no filtro
  created_at timestamptz default now()
);

-- ---------- IMAGENS DO PRODUTO (várias fotos por peça) ----------
create table if not exists product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references produtos(id) on delete cascade,
  url text not null,
  position int default 0
);

create index if not exists idx_product_images_product on product_images(product_id);
create index if not exists idx_produtos_category on produtos(category_id);
create index if not exists idx_produtos_ref_fabrica on produtos(ref_fabrica);
create index if not exists idx_produtos_ref_loja on produtos(ref_loja);
create index if not exists idx_produtos_promocao on produtos(promocao);

-- ============================================================
-- ROW LEVEL SECURITY
-- Leitura: qualquer visitante do site pode ver.
-- Escrita: só usuário autenticado (você, logado no admin.html).
-- ============================================================
alter table categories enable row level security;
alter table produtos enable row level security;
alter table product_images enable row level security;

create policy "public read categories"
  on categories for select using (true);

create policy "public read produtos"
  on produtos for select using (active = true);

create policy "public read product_images"
  on product_images for select using (true);

create policy "auth manage categories"
  on categories for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "auth manage produtos"
  on produtos for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "auth manage product_images"
  on product_images for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============================================================
-- Dados de exemplo (opcional - apague se não quiser)
-- ============================================================
insert into categories (name) values ('Camisetas'), ('Calças'), ('Vestidos')
on conflict (name) do nothing;
