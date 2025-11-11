create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  message text not null,
  created_by uuid not null references public.users(id) on delete set null,
  created_at timestamp with time zone default now(),
  read_at timestamp with time zone null
);

create index if not exists idx_notifications_recipient_created_at
  on public.notifications(recipient_user_id, created_at desc);

