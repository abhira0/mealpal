-- Which variant was used for a cooked movement, so nutrition can use the
-- variant's values instead of the product's own. null = product's own nutrition.
-- Stock stays per-product; variants share the same physical stock.
ALTER TABLE `stock_movements` ADD `variant_id` integer REFERENCES product_variants(`id`);
