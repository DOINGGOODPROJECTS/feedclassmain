ALTER TABLE supplier_invoices
ADD COLUMN IF NOT EXISTS due_date DATE NULL AFTER amount;
