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
