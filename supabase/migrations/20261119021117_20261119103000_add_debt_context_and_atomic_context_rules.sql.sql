/*
# Add debt context to independent debt records

1. Summary
- Adds a `context` column to `public.debts` so each hutang/piutang entry can be grouped as Pribadi or Eksternal.
- Keeps the column separate from `public.transactions`; direct debt entries do not create income or expense rows.
- Updates the atomic financial-action function so entries created from the quick transaction form retain their context.

2. Modified table
- `public.debts.context` (text, required, defaults to `personal`, constrained to `personal` or `external`).
- Existing debt rows are preserved and receive the safe `personal` default.

3. Security
- Existing authenticated policies continue to protect debt rows.
- The existing function is callable only by authenticated users and still uses the caller's database permissions.

4. Important notes
- The Hutang & Piutang panel uses direct debt actions for its Add and Delete-independent flows.
- Quick-add debt actions keep their existing linked transaction behavior for compatibility with the transaction workflow.
*/

ALTER TABLE public.debts
  ADD COLUMN IF NOT EXISTS context text NOT NULL DEFAULT 'personal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'debts_context_check'
      AND conrelid = 'public.debts'::regclass
  ) THEN
    ALTER TABLE public.debts
      ADD CONSTRAINT debts_context_check CHECK (context IN ('personal', 'external'));
  END IF;
END $$;

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
      FROM public.savings;
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

    v_context := lower(btrim(COALESCE(p_debt_context, '')));
    IF v_context = 'new' THEN v_context := 'personal'; END IF;
    IF v_context = 'repayment' THEN v_context := 'external'; END IF;
    IF v_context NOT IN ('personal', 'external') THEN
      RAISE EXCEPTION 'Pilih konteks Pribadi atau Eksternal.' USING ERRCODE = '22023';
    END IF;

    v_debt_type := CASE WHEN p_category = 'Hutang' THEN 'payable' ELSE 'receivable' END;
    v_debt_amount := CASE WHEN v_context = 'personal' THEN p_amount ELSE -p_amount END;

    IF p_category = 'Hutang' THEN
      v_transaction_type := CASE WHEN v_context = 'personal' THEN 'income' ELSE 'expense' END;
    ELSE
      v_transaction_type := CASE WHEN v_context = 'personal' THEN 'expense' ELSE 'income' END;
    END IF;
    v_transaction_category := p_category;
    v_transaction_description := btrim(p_description);

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
  ELSE
    RAISE EXCEPTION 'Jenis transaksi khusus tidak valid.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.transactions (amount, type, category, description, date)
  VALUES (p_amount, v_transaction_type, v_transaction_category, v_transaction_description, p_date)
  RETURNING * INTO v_transaction;

  IF v_effective_action = 'transfer' THEN
    INSERT INTO public.savings (amount, category, description, date, source_transaction_id)
    VALUES (p_amount, COALESCE(NULLIF(btrim(p_savings_category), ''), 'Umum'), btrim(p_description), p_date, v_transaction.id);
  ELSIF v_effective_action = 'withdrawal' THEN
    INSERT INTO public.savings (amount, category, description, date, source_transaction_id)
    VALUES (-p_amount, COALESCE(NULLIF(btrim(p_savings_category), ''), 'Umum'), 'Tarik tabungan - ' || btrim(p_description), p_date, v_transaction.id);
  ELSIF v_effective_action = 'debt' THEN
    INSERT INTO public.debts (amount, type, context, description, date, source_transaction_id)
    VALUES (v_debt_amount, v_debt_type, v_context, btrim(p_description), p_date, v_transaction.id);
  END IF;

  RETURN v_transaction;
END;
$$;

REVOKE ALL ON FUNCTION public.record_financial_action(text, numeric, text, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_financial_action(text, numeric, text, date, text, text, text) TO authenticated;
