create table if not exists public.bookings (
  id text primary key,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz,
  archived_at timestamptz,
  source text,
  status text not null default 'new' check (status in ('new', 'accepted', 'rejected')),
  name text not null,
  phone text not null,
  email text,
  contact_method text,
  year text not null,
  make text not null,
  model text not null,
  preferred_date text not null,
  time_window text not null,
  service_type text not null,
  concern text not null default '',
  visit_type text,
  urgency text
);

create index if not exists bookings_created_at_idx on public.bookings (created_at desc);
create index if not exists bookings_archived_at_idx on public.bookings (archived_at);

create table if not exists public.admin_users (
  id text primary key,
  username text not null unique,
  display_name text not null,
  role text not null check (role in ('head', 'access_manager', 'manager', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz,
  last_login_at timestamptz,
  password_salt text not null,
  password_hash text not null
);

create index if not exists admin_users_role_idx on public.admin_users (role);
create index if not exists admin_users_active_idx on public.admin_users (active);
