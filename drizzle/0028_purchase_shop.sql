-- Per-purchase shop override: where you actually bought it, when it differs from
-- the product's usual shop (e.g. a generic "buy anywhere" item). null = use the product's shop.
ALTER TABLE `purchases` ADD `shop_id` integer REFERENCES shops(`id`);
