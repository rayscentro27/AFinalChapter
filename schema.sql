
-- 1. PROFILES TABLE (Links to Auth.Users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'client',
  onboarding_complete BOOLEAN DEFAULT false,
  commission_split INTEGER DEFAULT 50,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. CONTACTS TABLE (Lead & Client Data)
CREATE TABLE public.contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  status TEXT DEFAULT 'Lead',
  value NUMERIC DEFAULT 0,
  revenue NUMERIC,
  time_in_business INTEGER,
  source TEXT,
  notes TEXT,
  checklist JSONB DEFAULT '{}'::jsonb,
  client_tasks JSONB DEFAULT '[]'::jsonb,
  persona TEXT,
  thinking_log JSONB DEFAULT '[]'::jsonb,
  documents JSONB DEFAULT '[]'::jsonb,
  activities JSONB DEFAULT '[]'::jsonb,
  invoices JSONB DEFAULT '[]'::jsonb,
  business_profile JSONB DEFAULT '{}'::jsonb,
  credit_analysis JSONB DEFAULT '{}'::jsonb,
  message_history JSONB DEFAULT '[]'::jsonb,
  connected_banks JSONB DEFAULT '[]'::jsonb,
  offers JSONB DEFAULT '[]'::jsonb,
  submissions JSONB DEFAULT '[]'::jsonb,
  financial_spreading JSONB DEFAULT '{}'::jsonb,
  notifications JSONB DEFAULT '[]'::jsonb,
  ledger JSONB DEFAULT '[]'::jsonb,
  negative_items JSONB DEFAULT '[]'::jsonb,
  subscription JSONB DEFAULT '{}'::jsonb,
  compliance JSONB DEFAULT '{}'::jsonb,
  stipulations JSONB DEFAULT '[]'::jsonb,
  funded_deals JSONB DEFAULT '[]'::jsonb,
  rescue_plan JSONB DEFAULT '{}'::jsonb,
  credit_memo JSONB DEFAULT '{}'::jsonb,
  ai_priority TEXT DEFAULT 'Cold',
  ai_reason TEXT,
  ai_score INTEGER DEFAULT 50,
  xp INTEGER DEFAULT 0,
  onboarding_complete BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. BRANDING TABLE (Agency Settings)
CREATE TABLE public.branding (
  id TEXT PRIMARY KEY DEFAULT 'global',
  name TEXT DEFAULT 'Nexus Funding',
  primary_color TEXT DEFAULT '#10b981',
  hero_headline TEXT,
  hero_subheadline TEXT,
  hero_video_url TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  physical_address TEXT,
  website_url TEXT,
  social_connections JSONB DEFAULT '[]'::jsonb,
  google_business JSONB DEFAULT '{}'::jsonb,
  tier_prices JSONB DEFAULT '{"Bronze": 97, "Silver": 197, "Gold": 497}'::jsonb,
  ai_cognition JSONB DEFAULT '{"expertiseMode": false, "thinkingBudget": 0}'::jsonb,
  auto_reply_rules JSONB DEFAULT '[]'::jsonb,
  ai_employees JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ENABLE ROW LEVEL SECURITY
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branding ENABLE ROW LEVEL SECURITY;

-- POLICIES (Simplistic for MVP, should be refined for production)
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Admins can view all contacts" ON public.contacts FOR SELECT USING (true);
CREATE POLICY "Public branding is viewable by everyone" ON public.branding FOR SELECT USING (true);
CREATE POLICY "Admins can update branding" ON public.branding FOR ALL USING (true);
CREATE POLICY "Admins can manage contacts" ON public.contacts FOR ALL USING (true);
