-- Add customer_id column to public.payments
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE;

-- Create index on customer_id for performance
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON public.payments(customer_id);

-- Drop the check constraint on payment_type if it exists to allow generic methods (e.g. bank_transfer, cheque)
DO $$
DECLARE
    constraint_name_val TEXT;
BEGIN
    SELECT conname INTO constraint_name_val
    FROM pg_constraint
    WHERE conrelid = 'public.payments'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%payment_type%';
      
    IF constraint_name_val IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.payments DROP CONSTRAINT ' || constraint_name_val;
    END IF;
END $$;
