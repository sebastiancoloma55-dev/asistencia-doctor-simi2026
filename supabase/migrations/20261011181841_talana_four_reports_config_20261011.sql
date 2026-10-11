-- Keep the bot panel and the scheduled/manual Talana runner aligned on all four reports.
-- This is an idempotent update: it does not start a run or enable/disable the bot.
UPDATE public.talana_bot_config
SET report_types = '["ausentismos_historico","solicitudes_vacaciones_historicas","maestro_empleado","reporte_jornadas_asistencia"]'::jsonb,
    updated_at = now(),
    updated_by = 'scoloma@farmaciasdoctorsimi.cl'
WHERE id = 1;
