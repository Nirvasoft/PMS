-- ============================================================
-- Grant BYPASSRLS to pms_app
-- ============================================================
-- The application already filters by company_id in every query.
-- With connection pooling, SET session variables can't reliably
-- stick to the same connection between middleware and query,
-- causing RLS to block data. BYPASSRLS lets the app handle
-- tenant isolation in code while keeping RLS as protection
-- against direct DB access from other roles.
-- ============================================================

ALTER ROLE pms_app BYPASSRLS;
