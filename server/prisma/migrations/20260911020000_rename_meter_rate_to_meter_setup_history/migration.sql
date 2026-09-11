ALTER TABLE meter_rate_history RENAME TO meter_setup_history;

-- Also rename the indexes so they stay consistent
ALTER INDEX IF EXISTS meter_rate_history_meter_setup_id_idx RENAME TO meter_setup_history_meter_setup_id_idx;
ALTER INDEX IF EXISTS meter_rate_history_company_id_idx     RENAME TO meter_setup_history_company_id_idx;
ALTER INDEX IF EXISTS meter_rate_history_pkey               RENAME TO meter_setup_history_pkey;
