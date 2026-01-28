-- Create the certificates table
create table public.certificates (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  created_at timestamptz default now(),
  report_id text not null, -- The friendly ID seen on the PDF
  payload jsonb,           -- Encrypted? Or just stored for replay
  headers jsonb,
  hash text,               -- For verification
  is_pro boolean default false
);

-- Enable Row Level Security (RLS)
alter table public.certificates enable row level security;

-- Create Policy: Users can only see their own certificates
create policy "Users can view own certificates"
  on public.certificates for select
  using (auth.uid() = user_id);

-- Create Policy: Users can insert their own certificates
create policy "Users can insert own certificates"
  on public.certificates for insert
  with check (auth.uid() = user_id);
