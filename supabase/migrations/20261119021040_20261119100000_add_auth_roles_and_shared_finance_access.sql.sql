/*
# Add authenticated shared finance access and account roles

1. Summary
- Adds a `profiles` table connected to Supabase Auth users.
- Stores a display username and one of two roles: `admin` or `user`.
- Adds `user_id` ownership metadata to the existing finance tables without deleting existing rows.
- Keeps the finance ledger shared between signed-in accounts so Arwan and Resita can see the same records.
- Keeps the existing atomic financial action function available to signed-in users.

2. New table
- `public.profiles`
- `id` (uuid, primary key, references `auth.users`)
- `username` (text, unique case-insensitively)
- `role` (text, either `admin` or `user`, default `user`)
- `created_at` (timestamptz)

3. Modified tables
- `transactions.user_id`, `savings.user_id`, and `debts.user_id`
- Each new row defaults its creator to the signed-in user.
- Existing rows, if any, remain in place and are not deleted.

4. Security changes
- Anonymous access is removed from the finance tables and financial-action function.
- Signed-in users can read the shared ledger and add records.
- Signed-in users can update only records they created.
- Only profiles with role `admin` can delete finance records.
- The `user_id`, role, and audit ownership fields are not client-writable.
- A security-definer helper checks the caller's role inside database policies.
- A trigger creates a normal-user profile automatically for future signups.

5. Important notes
- The browser must authenticate before reading or writing finance data.
- The initial named accounts are provisioned separately through the account bootstrap function; passwords are never stored in this migration.
- The existing savings/debt source links remain intact, so deleting an admin-approved source transaction still removes only its linked automatic entry through the existing foreign-key cascade.
*/

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_key
  ON public.profiles (lower(username));

GRANT SELECT ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

DROP POLICY IF EXISTS "profiles_select_self_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_self_or_admin" ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_admin());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'on_auth_user_created_profile'
      AND tgrelid = 'auth.users'::regclass
  ) THEN
    CREATE OR REPLACE FUNCTION public.create_profile_for_user()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $function$
    BEGIN
      INSERT INTO public.profiles (id, username)
      VALUES (
        NEW.id,
        COALESCE(
          NULLIF(btrim(NEW.raw_user_meta_data ->> 'username'), ''),
          NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
          'user'
        )
      )
      ON CONFLICT (id) DO NOTHING;
      RETURN NEW;
    END;
    $function$;

    REVOKE EXECUTE ON FUNCTION public.create_profile_for_user() FROM PUBLIC, anon, authenticated;

    CREATE TRIGGER on_auth_user_created_profile
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.create_profile_for_user();
  END IF;
END $$;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();
ALTER TABLE public.savings
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();
ALTER TABLE public.debts
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_savings_user_id ON public.savings (user_id);
CREATE INDEX IF NOT EXISTS idx_debts_user_id ON public.debts (user_id);

REVOKE ALL ON public.transactions, public.savings, public.debts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions, public.savings, public.debts TO authenticated;

REVOKE INSERT, UPDATE ON public.transactions FROM authenticated;
GRANT INSERT (amount, type, category, description, date) ON public.transactions TO authenticated;
GRANT UPDATE (amount, type, category, description, date) ON public.transactions TO authenticated;

REVOKE INSERT, UPDATE ON public.savings FROM authenticated;
GRANT INSERT (amount, category, description, date, source_transaction_id) ON public.savings TO authenticated;
GRANT UPDATE (amount, category, description, date, source_transaction_id) ON public.savings TO authenticated;

REVOKE INSERT, UPDATE ON public.debts FROM authenticated;
GRANT INSERT (amount, type, description, date, source_transaction_id) ON public.debts TO authenticated;
GRANT UPDATE (amount, type, description, date, source_transaction_id) ON public.debts TO authenticated;

DROP POLICY IF EXISTS "anon_select_transactions" ON public.transactions;
DROP POLICY IF EXISTS "anon_insert_transactions" ON public.transactions;
DROP POLICY IF EXISTS "anon_update_transactions" ON public.transactions;
DROP POLICY IF EXISTS "anon_delete_transactions" ON public.transactions;
DROP POLICY IF EXISTS "auth_select_transactions" ON public.transactions;
DROP POLICY IF EXISTS "auth_insert_transactions" ON public.transactions;
DROP POLICY IF EXISTS "auth_update_transactions" ON public.transactions;
DROP POLICY IF EXISTS "auth_delete_transactions" ON public.transactions;

CREATE POLICY "auth_select_transactions" ON public.transactions FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "auth_insert_transactions" ON public.transactions FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "auth_update_transactions" ON public.transactions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "auth_delete_transactions" ON public.transactions FOR DELETE
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "anon_select_savings" ON public.savings;
DROP POLICY IF EXISTS "anon_insert_savings" ON public.savings;
DROP POLICY IF EXISTS "anon_update_savings" ON public.savings;
DROP POLICY IF EXISTS "anon_delete_savings" ON public.savings;
DROP POLICY IF EXISTS "auth_select_savings" ON public.savings;
DROP POLICY IF EXISTS "auth_insert_savings" ON public.savings;
DROP POLICY IF EXISTS "auth_update_savings" ON public.savings;
DROP POLICY IF EXISTS "auth_delete_savings" ON public.savings;

CREATE POLICY "auth_select_savings" ON public.savings FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "auth_insert_savings" ON public.savings FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "auth_update_savings" ON public.savings FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "auth_delete_savings" ON public.savings FOR DELETE
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "anon_select_debts" ON public.debts;
DROP POLICY IF EXISTS "anon_insert_debts" ON public.debts;
DROP POLICY IF EXISTS "anon_update_debts" ON public.debts;
DROP POLICY IF EXISTS "anon_delete_debts" ON public.debts;
DROP POLICY IF EXISTS "auth_select_debts" ON public.debts;
DROP POLICY IF EXISTS "auth_insert_debts" ON public.debts;
DROP POLICY IF EXISTS "auth_update_debts" ON public.debts;
DROP POLICY IF EXISTS "auth_delete_debts" ON public.debts;

CREATE POLICY "auth_select_debts" ON public.debts FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "auth_insert_debts" ON public.debts FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "auth_update_debts" ON public.debts FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "auth_delete_debts" ON public.debts FOR DELETE
  TO authenticated USING (public.is_admin());

REVOKE ALL ON FUNCTION public.record_financial_action(text, numeric, text, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_financial_action(text, numeric, text, date, text, text, text) TO authenticated;
