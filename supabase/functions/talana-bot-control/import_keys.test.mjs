import test from "node:test";
import assert from "node:assert/strict";
import {
  importStableKey,
  importKeyFields,
  normalizeImportRut,
} from "./import_keys.js";

test("ausentismo identity is stable when the end date changes", () => {
  const before = { rut: "12.345.678-5", fecha_inicio: "2026-10-01", fecha_fin: "2026-10-10", tipo_ausencia: "Licencia médica" };
  const after = { ...before, fecha_fin: "2026-10-12" };
  assert.equal(importStableKey("ausentismos_historico", before), importStableKey("ausentismos_historico", after));
  assert.deepEqual(importKeyFields("ausentismos_historico"), ["rut", "fecha_inicio", "tipo_ausencia"]);
});

test("vacation identity is stable when the end date changes", () => {
  const before = { rut: "12.345.678-5", fecha_inicio: "2026-11-02", fecha_fin: "2026-11-06", tipo_vacaciones: "vacaciones" };
  const after = { ...before, fecha_fin: "2026-11-09" };
  assert.equal(importStableKey("solicitudes_vacaciones_historicas", before), importStableKey("solicitudes_vacaciones_historicas", after));
});

test("attendance identity ignores shift changes and normalizes RUT punctuation", () => {
  const before = { rut: "12.345.678-5", fecha: "2026-10-01", turno: "Apertura" };
  const after = { rut: "12345678-5", fecha: "01/10/2026", turno: "Cierre" };
  assert.equal(normalizeImportRut(before.rut), normalizeImportRut(after.rut));
  assert.equal(importStableKey("reporte_jornadas_asistencia", before), importStableKey("reporte_jornadas_asistencia", after));
});

test("incomplete identity keys are rejected rather than matched ambiguously", () => {
  assert.equal(importStableKey("ausentismos_historico", { rut: "12.345.678-5", fecha_inicio: "2026-10-01" }), null);
});
