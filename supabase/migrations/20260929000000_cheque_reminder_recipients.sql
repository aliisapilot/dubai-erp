-- ==============================================================================
-- Dubai ERP: Cheque Reminder Settings, Multi-Category Recipients & Customer Preferences
-- File: supabase/migrations/20260929000000_cheque_reminder_recipients.sql
-- Idempotent, non-destructive, safe for live production.
-- ==============================================================================

-- 1. Cheque Reminder Recipients (Supervisors, Developer & External Emails)
CREATE TABLE IF NOT EXISTS public.cheque_reminder_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  recipient_category TEXT NOT NULL CHECK (recipient_category IN ('supervisor', 'developer', 'external')),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  channels TEXT NOT NULL DEFAULT 'email' CHECK (channels IN ('email', 'whatsapp', 'both')),
  preferences JSONB NOT NULL DEFAULT '{
    "incoming": true,
    "outgoing": true,
    "due_today": true,
    "overdue": true,
    "summary": true,
    "technical_alerts": false
  }'::jsonb,
  assigned_customer_ids UUID[] DEFAULT '{}',
  assigned_cheque_ids UUID[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_company_recipient_email_category UNIQUE (company_id, email, recipient_category)
);

CREATE INDEX IF NOT EXISTS idx_cheque_recipients_company_category
  ON public.cheque_reminder_recipients(company_id, recipient_category, is_enabled);

-- 2. Customer Reminder Configuration & Consent Preferences
CREATE TABLE IF NOT EXISTS public.customer_reminder_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  override_email TEXT,
  override_phone TEXT,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  consent_given_at TIMESTAMPTZ,
  consent_notes TEXT,
  opt_out BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_customer_reminder_company UNIQUE (company_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_reminders_company
  ON public.customer_reminder_configs(company_id, customer_id);

-- 3. Company Cheque Reminder Settings & Schedules
CREATE TABLE IF NOT EXISTS public.company_cheque_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,
  reminder_days INTEGER[] NOT NULL DEFAULT '{7, 3, 1, 0}',
  overdue_reminders_enabled BOOLEAN NOT NULL DEFAULT true,
  developer_email TEXT,
  developer_alerts_enabled BOOLEAN NOT NULL DEFAULT true,
  whatsapp_provider TEXT NOT NULL DEFAULT 'manual' CHECK (whatsapp_provider IN ('manual', 'meta_cloud', 'twilio')),
  whatsapp_phone_number_id TEXT,
  whatsapp_business_account_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.cheque_reminder_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_reminder_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_cheque_settings ENABLE ROW LEVEL SECURITY;

-- 5. Multi-Company RLS Policies (Scoped to get_auth_user_company_ids)
DROP POLICY IF EXISTS "cheque_recipients_company_isolation" ON public.cheque_reminder_recipients;
CREATE POLICY "cheque_recipients_company_isolation" ON public.cheque_reminder_recipients
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

DROP POLICY IF EXISTS "customer_reminders_company_isolation" ON public.customer_reminder_configs;
CREATE POLICY "customer_reminders_company_isolation" ON public.customer_reminder_configs
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

DROP POLICY IF EXISTS "company_cheque_settings_company_isolation" ON public.company_cheque_settings;
CREATE POLICY "company_cheque_settings_company_isolation" ON public.company_cheque_settings
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

-- 6. Grant Permissions to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cheque_reminder_recipients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_reminder_configs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_cheque_settings TO authenticated;

-- 7. Refresh PostgREST Schema Cache
NOTIFY pgrst, 'reload schema';
