CREATE INDEX idx_transactions_created_at ON transactions (created_at);
CREATE INDEX idx_transactions_child_date ON transactions (child_id, created_at);

DROP TRIGGER IF EXISTS trg_transactions_prevent_update;
DROP TRIGGER IF EXISTS trg_transactions_prevent_delete;

CREATE TRIGGER trg_transactions_prevent_update
BEFORE UPDATE ON transactions
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'transactions ledger is append-only; updates are not allowed';

CREATE TRIGGER trg_transactions_prevent_delete
BEFORE DELETE ON transactions
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'transactions ledger is append-only; deletes are not allowed';
