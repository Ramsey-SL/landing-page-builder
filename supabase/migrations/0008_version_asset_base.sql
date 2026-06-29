-- Derived versions (edit/inspired) reuse the ORIGINAL clone's uploaded assets.
-- Only the clone has an assets/ folder in Storage, so every version records the
-- absolute base URL where its assets live (the clone's folder) and children
-- inherit it — otherwise a chain (inspired-of-inspired) points at an empty
-- folder and all images break.
alter table versions add column if not exists asset_base_url text;
