ALTER TABLE public.savings
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Umum';

ALTER TABLE public.debts
  ADD COLUMN IF NOT EXISTS context text NOT NULL DEFAULT 'personal';

UPDATE public.debts
SET context = 'external'
WHERE amount < 0 AND context = 'personal';

ALTER TABLE public.debts
  DROP CONSTRAINT IF EXISTS debts_context_check;

ALTER TABLE public.debts
  ADD CONSTRAINT debts_context_check CHECK (context IN ('personal', 'external'));

DROP TRIGGER IF EXISTS create_user_profile_after_signup ON auth.users;
DROP FUNCTION IF EXISTS public.create_user_profile();
DROP FUNCTION IF EXISTS public.is_finance_admin() CASCADE;
DROP TABLE IF EXISTS public.user_profiles;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['transactions', 'savings', 'debts']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "anon_select_%s" ON public.%I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "anon_insert_%s" ON public.%I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "anon_update_%s" ON public.%I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "anon_delete_%s" ON public.%I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "finance_read_%s" ON public.%I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "finance_add_%s" ON public.%I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "finance_update_%s" ON public.%I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "finance_admin_delete_%s" ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY "anon_select_%s" ON public.%I FOR SELECT TO anon, authenticated USING (true)',
      table_name, table_name
    );
    EXECUTE format(
      'CREATE POLICY "anon_insert_%s" ON public.%I FOR INSERT TO anon, authenticated WITH CHECK (true)',
      table_name, table_name
    );
    EXECUTE format(
      'CREATE POLICY "anon_update_%s" ON public.%I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true)',
      table_name, table_name
    );
    EXECUTE format(
      'CREATE POLICY "anon_delete_%s" ON public.%I FOR DELETE TO anon, authenticated USING (true)',
      table_name, table_name
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_financial_action(
  p_action text,
  p_amount numeric,
  p_category text,
  p_date date,
  p_debt_context text,
  p_savings_category text,
  p_description text
)
RETURNS public.transactions
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_transaction public.transactions%ROWTYPE;
  v_transaction_type text;
  v_transaction_category text;
  v_transaction_description text;
  v_debt_type text;
  v_debt_amount numeric;
  v_current_balance numeric;
  v_savings_balance numeric;
  v_effective_action text := p_action;
  v_context text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('financial-assets'));

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Jumlah harus lebih dari nol.' USING ERRCODE = '22023';
  END IF;
  IF p_date IS NULL OR p_description IS NULL OR btrim(p_description) = '' THEN
    RAISE EXCEPTION 'Tanggal dan nama pihak/deskripsi wajib diisi.' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'expense' AND lower(btrim(COALESCE(p_category, ''))) = 'tabungan' THEN
    v_effective_action := 'transfer';
  END IF;

  IF v_effective_action = 'transfer' THEN
    v_transaction_type := 'expense';
    v_transaction_category := 'Tabungan';
    v_transaction_description := btrim(p_description);
  ELSIF v_effective_action = 'withdrawal' THEN
    IF p_category IS DISTINCT FROM 'Tabungan' THEN
      RAISE EXCEPTION 'Kategori penarikan harus Tabungan.' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(SUM(amount), 0)
      INTO v_savings_balance
      FROM public.savings
      WHERE category = COALESCE(NULLIF(btrim(p_savings_category), ''), 'Umum');
    IF p_amount > v_savings_balance THEN
      RAISE EXCEPTION 'Saldo tabungan tidak mencukupi.' USING ERRCODE = '22023';
    END IF;

    v_transaction_type := 'income';
    v_transaction_category := 'Tabungan';
    v_transaction_description := 'Tarik tabungan - ' || btrim(p_description);
  ELSIF v_effective_action IN ('income', 'expense') THEN
    v_transaction_type := v_effective_action;
    v_transaction_category := COALESCE(NULLIF(btrim(p_category), ''), 'Lainnya');
    v_transaction_description := btrim(p_description);
  ELSIF v_effective_action = 'debt' THEN
    IF p_category IS NULL OR p_category NOT IN ('Hutang', 'Piutang') THEN
      RAISE EXCEPTION 'Kategori Hutang/Piutang tidak valid.' USING ERRCODE = '22023';
    END IF;

    v_context := lower(btrim(COALESCE(p_debt_context, 'personal')));
    IF v_context = 'new' THEN
      v_context := 'personal';
    ELSIF v_context = 'repayment' THEN
      v_context := 'external';
    END IF;
    IF v_context NOT IN ('personal', 'external') THEN
      RAISE EXCEPTION 'Pilih konteks Pribadi atau Eksternal.' USING ERRCODE = '22023';
    END IF;

    v_debt_type := CASE WHEN p_category = 'Hutang' THEN 'payable' ELSE 'receivable' END;
    v_debt_amount := CASE WHEN v_context = 'personal' THEN p_amount ELSE -p_amount END;

    IF v_context = 'external' THEN
      SELECT COALESCE(SUM(amount), 0)
        INTO v_current_balance
        FROM public.debts
        WHERE type = v_debt_type
          AND lower(btrim(description)) = lower(btrim(p_description));
      IF p_amount > v_current_balance THEN
        RAISE EXCEPTION 'Jumlah pembayaran melebihi saldo pihak tersebut.' USING ERRCODE = '22023';
      END IF;
    END IF;

    IF p_category = 'Hutang' THEN
      v_transaction_type := CASE WHEN v_context = 'personal' THEN 'income' ELSE 'expense' END;
    ELSE
      v_transaction_type := CASE WHEN v_context = 'personal' THEN 'expense' ELSE 'income' END;
    END IF;
    v_transaction_category := p_category;
    v_transaction_description := btrim(p_description);
  ELSE
    RAISE EXCEPTION 'Jenis transaksi khusus tidak valid.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.transactions (amount, type, category, description, date)
  VALUES (p_amount, v_transaction_type, v_transaction_category, v_transaction_description, p_date)
  RETURNING * INTO v_transaction;

  IF v_effective_action = 'transfer' THEN
    INSERT INTO public.savings (amount, category, description, date, source_transaction_id)
    VALUES (
      p_amount,
      COALESCE(NULLIF(btrim(p_savings_category), ''), 'Umum'),
      btrim(p_description),
      p_date,
      v_transaction.id
    );
  ELSIF v_effective_action = 'withdrawal' THEN
    INSERT INTO public.savings (amount, category, description, date, source_transaction_id)
    VALUES (
      -p_amount,
      COALESCE(NULLIF(btrim(p_savings_category), ''), 'Umum'),
      'Tarik tabungan - ' || btrim(p_description),
      p_date,
      v_transaction.id
    );
  ELSIF v_effective_action = 'debt' THEN
    INSERT INTO public.debts (amount, type, context, description, date, source_transaction_id)
    VALUES (v_debt_amount, v_debt_type, v_context, btrim(p_description), p_date, v_transaction.id);
  END IF;

  RETURN v_transaction;
END;
$$;

REVOKE ALL ON FUNCTION public.record_financial_action(text, numeric, text, date, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_financial_action(text, numeric, text, date, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.replace_finance_dataset(
  p_transactions jsonb DEFAULT NULL,
  p_savings jsonb DEFAULT NULL,
  p_debts jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_debts IS NOT NULL THEN
    DELETE FROM public.debts;
  END IF;
  IF p_savings IS NOT NULL THEN
    DELETE FROM public.savings;
  END IF;
  IF p_transactions IS NOT NULL THEN
    DELETE FROM public.transactions;
  END IF;

  IF p_transactions IS NOT NULL THEN
    INSERT INTO public.transactions (id, amount, type, category, description, date, created_at)
    SELECT id, amount, type, category, COALESCE(description, ''), date, COALESCE(created_at, now())
    FROM jsonb_to_recordset(p_transactions) AS imported_row(
      id uuid, amount numeric, type text, category text, description text, date date, created_at timestamptz
    );
  END IF;

  IF p_savings IS NOT NULL THEN
    INSERT INTO public.savings (id, amount, category, description, date, created_at, source_transaction_id)
    SELECT id, amount, COALESCE(NULLIF(category, ''), 'Umum'), COALESCE(description, ''), date,
      COALESCE(created_at, now()), source_transaction_id
    FROM jsonb_to_recordset(p_savings) AS imported_row(
      id uuid, amount numeric, category text, description text, date date, created_at timestamptz, source_transaction_id uuid
    );
  END IF;

  IF p_debts IS NOT NULL THEN
    INSERT INTO public.debts (id, amount, type, context, description, date, created_at, source_transaction_id)
    SELECT id, amount, type, COALESCE(NULLIF(context, ''), 'personal'), COALESCE(description, ''), date,
      COALESCE(created_at, now()), source_transaction_id
    FROM jsonb_to_recordset(p_debts) AS imported_row(
      id uuid, amount numeric, type text, context text, description text, date date, created_at timestamptz, source_transaction_id uuid
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_finance_dataset(jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_finance_dataset(jsonb, jsonb, jsonb) TO anon, authenticated;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['transactions', 'savings', 'debts']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END;
$$;
