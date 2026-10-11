import assert from "node:assert/strict";
import test from "node:test";
import {
  importKeyFields,
  importStableKey,
  normalizeImportRut,
} from "../supabase/functions/talana-bot-control/import_keys.js";

test("vacaciones usa exactamente la clave única de Supabase, no fecha_solicitud", () => {
  const row = {
    rut: "12.345.678-5",
    fecha_solicitud: "2026-10-01",
    fecha_inicio: "2026-11-02",
    fecha_fin: "2026-11-06",
    tipo_vacaciones: "Vacaciones",
  };
  const laterExport = { ...row, fecha_solicitud: "2026-10-08" };
  assert.deepEqual(importKeyFields("solicitudes_vacaciones_historicas"), [
    "rut", "fecha_inicio", "fecha_fin", "tipo_vacaciones",
  ]);
  assert.equal(
    importStableKey("solicitudes_vacaciones_historicas", row),
    importStableKey("solicitudes_vacaciones_historicas", laterExport),
  );
});

test("asistencia identifica el mismo registro por RUT y fecha aunque cambie el turno", () => {
  const morning = { rut: "9.876.543-K", fecha: "2026-10-11", turno: "Apertura" };
  const updatedShift = { ...morning, turno: "Cierre" };
  assert.equal(
    importStableKey("reporte_jornadas_asistencia", morning),
    importStableKey("reporte_jornadas_asistencia", updatedShift),
  );
});

test("licencias usa el índice único y permite actualizar otros campos", () => {
  const existing = {
    rut: "15.333.222-1",
    fecha_inicio: "2026-09-01",
    fecha_fin: "2026-09-10",
    tipo_ausencia: "licencia médica",
    motivo_ausencia: "Enfermedad",
  };
  const incoming = { ...existing, motivo_ausencia: "Reposo médico" };
  assert.deepEqual(importKeyFields("ausentismos_historico"), [
    "rut", "fecha_inicio", "fecha_fin", "tipo_ausencia",
  ]);
  assert.equal(
    importStableKey("ausentismos_historico", existing),
    importStableKey("ausentismos_historico", incoming),
  );
});

test("rechaza claves incompletas para evitar falsas coincidencias y duplicados", () => {
  assert.equal(importStableKey("solicitudes_vacaciones_historicas", {
    rut: "12.345.678-5", fecha_inicio: "2026-11-02",
    fecha_fin: "2026-11-06", tipo_vacaciones: "",
  }), null);
  assert.equal(importStableKey("ausentismos_historico", {
    rut: "12.345.678-5", fecha_inicio: "", fecha_fin: "2026-09-10",
    tipo_ausencia: "licencia médica",
  }), null);
  assert.equal(importStableKey("reporte_jornadas_asistencia", {
    rut: "12.345.678-5",
  }), null);
});

test("normaliza RUT con puntos y espacios", () => {
  assert.equal(normalizeImportRut(" 12.345.678-5 "), "12345678-5");
});
