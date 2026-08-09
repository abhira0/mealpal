ALTER TABLE purchases ADD COLUMN manual integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_stock_movements_purchase_id ON stock_movements (purchase_id);
