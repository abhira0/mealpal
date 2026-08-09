-- Tag a batch's pack-time stock movements so editing/deleting the batch can
-- reverse the exact depletion (preserving FEFO lots) by deleting these rows.
-- null = not from a batch pack (cook/serve/manual movements).
ALTER TABLE `stock_movements` ADD `batch_id` integer REFERENCES batches(`id`);
