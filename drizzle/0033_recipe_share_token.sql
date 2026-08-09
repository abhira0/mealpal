ALTER TABLE recipes ADD COLUMN share_token text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_share_token ON recipes (share_token);
