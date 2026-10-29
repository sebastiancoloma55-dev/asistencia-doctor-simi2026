import test from "node:test";
import assert from "node:assert/strict";
import {
  importStableKey,
  importKeyFields,
  normalizeImportRut,
  chileMondayISO,
  parseDateISO,
} from "./import_keys.js";

test("ausentismo identity is stable when the end date changes", () => {
  const before = { rut: "12.345.678-5", fecha_inicio: "2026-10-01", fecha_fin: "2026-10-10", tipo_ausencia: "Licencia médica" };
  const after = { ...before, fecha_fin: "2026-10-12" };
  assert.equal(importStableKey("ausentismos_historico", before), importStableKey("ausentismos_historico", after));
  assert.deepEqual(importKeyFields("ausentismos_historico"), ["rut", "fecha_inicio", "tipo_ausencia", "fecha_creacion", "hora_inicio", "hora_fin"]);
});

test("absence identity distinguishes separate creation timestamps", () => {
  const first = { rut: "12.345.678-5", fecha_inicio: "2026-10-01", tipo_ausencia: "Licencia médica", fecha_creacion: "2026-10-01 08:00:00" };
  const second = { ...first, fecha_creacion: "2026-10-02 09:00:00" };
  assert.notEqual(importStableKey("ausentismos_historico", first), importStableKey("ausentismos_historico", second));
});

test("vacation identity preserves separate requests with different timestamps", () => {
  const first = { rut: "12.345.678-5", fecha_inicio: "2026-11-02", tipo_vacaciones: "vacaciones", fecha_solicitud: "2026-10-01 08:00:00" };
  const second = { ...first, fecha_solicitud: "01/10/2026 - 09:00:00" };
  assert.notEqual(importStableKey("solicitudes_vacaciones_historicas", first), importStableKey("solicitudes_vacaciones_historicas", second));
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

test("normalizes PostgreSQL ISO timestamps to XLSX dates", () => {
  const fromExcel = { rut: "12.345.678-5", fecha: "01/10/2026", turno: "Apertura" };
  const fromDatabase = { rut: "12345678-5", fecha: "2026-10-01T00:00:00+00:00", turno: "Cierre" };
  assert.equal(importStableKey("reporte_jornadas_asistencia", fromExcel), importStableKey("reporte_jornadas_asistencia", fromDatabase));
});

test("normalizes accents in natural-key text fields", () => {
  const a = { rut: "12.345.678-5", fecha_inicio: "2026-10-01", tipo_ausencia: "Licencia Médica" };
  const b = { rut: "12345678-5", fecha_inicio: "2026-10-01T00:00:00Z", tipo_ausencia: "Licencia Medica" };
  assert.equal(importStableKey("ausentismos_historico", a), importStableKey("ausentismos_historico", b));
});

test("attendance identity overwrites the same employee-day when marks change", () => {
  const entry = { rut: "11131144-7", fecha: "02/10/2026", entrada: "07:32:14", salida: null };
  const exit = { rut: "11131144-7", fecha: "2026-10-02", entrada: null, salida: "22:36:04" };
  assert.equal(importStableKey("reporte_jornadas_asistencia", entry), importStableKey("reporte_jornadas_asistencia", exit));
});


test("vacation and attendance keys intentionally omit mutable fields", () => {
  assert.deepEqual(importKeyFields("solicitudes_vacaciones_historicas"), ["rut", "fecha_inicio", "tipo_vacaciones", "fecha_solicitud", "jornada"]);
  assert.deepEqual(importKeyFields("reporte_jornadas_asistencia"), ["rut", "fecha"]);
});

test("weekly absence filter starts on Monday in Chile and advances each week", () => {
  assert.equal(chileMondayISO(new Date("2026-10-29T12:00:00Z")), "2026-10-26");
  assert.equal(chileMondayISO(new Date("2026-11-04T12:00:00Z")), "2026-11-02");
  assert.equal(parseDateISO("26/10/2026"), "2026-10-26");
  assert.equal(parseDateISO("2026-10-26 09:30:00"), "2026-10-26");
  assert.equal(parseDateISO(""), null);
});
