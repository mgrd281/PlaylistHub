-- URL Protection: allows users to password-protect viewing of raw stream URLs
-- The password_hash is bcrypt-hashed server-side

CREATE TABLE IF NOT EXISTS public.url_protection (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_url_protection_user_id ON public.url_protection(user_id);

ALTER TABLE public.url_protection ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own url_protection" ON public.url_protection FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own url_protection" ON public.url_protection FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own url_protection" ON public.url_protection FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own url_protection" ON public.url_protection FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_url_protection_updated_at BEFORE UPDATE ON public.url_protection
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();
