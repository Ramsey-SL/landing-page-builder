-- Before/after benchmarking: store the ORIGINAL page's Lighthouse scores
-- alongside the rebuild's. Both columns now hold { mobile, desktop } objects,
-- each { performance, accessibility, best-practices, seo }.
-- (versions.scores already exists; it now carries the { mobile, desktop } shape.)
alter table versions add column if not exists source_scores jsonb;
