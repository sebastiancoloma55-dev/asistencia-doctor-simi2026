import { readdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const files = readdirSync(join(root, "js")).filter((name) => name.endsWith(".js")).map((name) => join(root, "js", name));
const htmlPath = join(root, "index.html");
const html = readFileSync(htmlPath, "utf8");
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
const temp = mkdtempSync(join(tmpdir(), "doctor-simi-js-check-"));
let failures = 0;

function check(source, label) {
  const file = join(temp, label.replace(/[^a-zA-Z0-9_.-]/g, "_") + ".cjs");
  writeFileSync(file, source, "utf8");
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    failures += 1;
    process.stderr.write("\nERROR de sintaxis: " + label + "\n" + (result.stderr || result.stdout));
  } else {
    process.stdout.write("OK: " + label + "\n");
  }
}

try {
  for (const file of files) check(readFileSync(file, "utf8"), "js/" + file.split(/[\\/]/).pop());
  let inlineIndex = 0;
  for (const match of scripts) {
    const attrs = match[1] || "";
    const body = match[2] || "";
    if (/\bsrc\s*=/.test(attrs) || !body.trim()) continue;
    const type = (attrs.match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1] || "text/javascript";
    if (!/^(text|application)\/(javascript|ecmascript)$/i.test(type) && type !== "module") continue;
    inlineIndex += 1;
    check(body, "index-inline-" + inlineIndex);
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
if (failures) process.exit(1);
process.stdout.write("\nValidación sintáctica completada sin errores.\n");
