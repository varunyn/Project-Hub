import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadModules() {
  const out = mkdtempSync(path.join(os.tmpdir(), "project-hub-report-progress-tsc-"));
  const declaration = path.join(out, "server-only.d.ts");
  writeFileSync(declaration, 'declare module "server-only";');
  mkdirSync(path.join(out, "node_modules/server-only"), { recursive: true });
  writeFileSync(path.join(out, "node_modules/server-only/index.js"), "");
  try {
    execFileSync(
      "pnpm",
      [
        "exec",
        "tsc",
        "--ignoreConfig",
        "app/lib/dependencyReportRunner.ts",
        "app/lib/dependencyReport.ts",
        "app/lib/dependencyReportSelection.ts",
        "app/lib/dependencyReportTypes.ts",
        "app/lib/dependencyReportUi.ts",
        declaration,
        "--outDir",
        out,
        "--module",
        "Node16",
        "--target",
        "es2022",
        "--skipLibCheck",
        "--noCheck",
        "--moduleResolution",
        "node16",
        "--types",
        "node",
      ],
      { cwd: root, stdio: "pipe" }
    );
  } catch {
    // TypeScript still emits the modules; server-only declarations are a full-app concern.
  }
  return {
    out,
    runner: require(path.join(out, "lib/dependencyReportRunner.js")),
    report: require(path.join(out, "lib/dependencyReport.js")),
    ui: require(path.join(out, "lib/dependencyReportUi.js")),
  };
}

test("progress parser accepts reporter events and rejects invalid events", () => {
  const { out, runner } = loadModules();
  try {
    assert.deepEqual(
      runner.parseProgressLine(
        '{"type":"dependency_report_progress","phase":"ai_enrichment","completed":2,"total":7}'
      ),
      {
        phase: "ai_enrichment",
        completed: 2,
        total: 7,
      }
    );
    for (const line of [
      "not json",
      '{"type":"other","phase":"scanning","completed":0,"total":1}',
      '{"type":"dependency_report_progress","phase":"unknown","completed":0,"total":1}',
      '{"type":"dependency_report_progress","phase":"scanning","completed":-1,"total":1}',
      '{"type":"dependency_report_progress","phase":"scanning","completed":1.5,"total":2}',
      '{"type":"dependency_report_progress","phase":"scanning","completed":2,"total":1}',
      '{"type":"dependency_report_progress","phase":"scanning","completed":1,"total":null}',
    ]) {
      assert.equal(runner.parseProgressLine(line), null);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("UI labels keep historical enrichment state and phase-specific progress", () => {
  const { out, ui } = loadModules();
  try {
    assert.equal(ui.dependencyEnrichmentLabel("completed", false), "AI completed");
    assert.equal(ui.dependencyEnrichmentLabel("disabled", true), "AI disabled");
    assert.equal(ui.dependencyProgressLabel("scanning", 1, 2), "1 of 2 scan roots");
    assert.equal(ui.dependencyProgressLabel("release_lookup", 3, 7), "3 of 7 dependencies");
    assert.equal(ui.dependencyProgressLabel("ai_enrichment", 2, 4), "2 of 4 candidates");
    assert.equal(ui.dependencyProgressLabel("finalizing", 0, 0), "");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("generated config includes bounded enrichment settings", () => {
  const { out, runner } = loadModules();
  const previous = {
    cache: process.env.DEPENDENCY_REPORT_CACHE_PATH,
    evidence: process.env.DEPENDENCY_REPORT_EVIDENCE_MAX_CHARS,
    completion: process.env.DEPENDENCY_REPORT_AI_COMPLETION_TOKENS,
    schema: process.env.DEPENDENCY_REPORT_AI_PROMPT_SCHEMA,
    reasoning: process.env.DEPENDENCY_REPORT_AI_REASONING_EFFORT,
  };
  try {
    Object.assign(process.env, {
      DEPENDENCY_REPORT_CACHE_PATH: "/tmp/shared-cache.json",
      DEPENDENCY_REPORT_EVIDENCE_MAX_CHARS: "1234",
      DEPENDENCY_REPORT_AI_COMPLETION_TOKENS: "99",
      DEPENDENCY_REPORT_AI_PROMPT_SCHEMA: "schema-test",
      DEPENDENCY_REPORT_AI_REASONING_EFFORT: "low",
    });
    const config = runner.buildReporterConfig(["/projects/example"], "/tmp/report", true);
    assert.match(config, /\.eve/);
    assert.match(config, /cache_path: "\/tmp\/shared-cache\.json"/);
    assert.match(config, /evidence_max_chars: 1234/);
    assert.match(config, /completion_tokens: 99/);
    assert.match(config, /prompt_schema: "schema-test"/);
    assert.match(config, /reasoning_effort: "low"/);
  } finally {
    const envNames = {
      cache: "DEPENDENCY_REPORT_CACHE_PATH",
      evidence: "DEPENDENCY_REPORT_EVIDENCE_MAX_CHARS",
      completion: "DEPENDENCY_REPORT_AI_COMPLETION_TOKENS",
      schema: "DEPENDENCY_REPORT_AI_PROMPT_SCHEMA",
      reasoning: "DEPENDENCY_REPORT_AI_REASONING_EFFORT",
    };
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[envNames[key]];
      else process.env[envNames[key]] = value;
    }
    rmSync(out, { recursive: true, force: true });
  }
});

test("report normalization preserves enrichment metrics, null usage, and warnings", async () => {
  const { out, report } = loadModules();
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "project-hub-report-json-"));
  const previous = process.env.DEPENDENCY_REPORT_OUTPUT_DIR;
  try {
    process.env.DEPENDENCY_REPORT_OUTPUT_DIR = dataDir;
    writeFileSync(
      path.join(dataDir, "dependency-report-2026-09-01.json"),
      JSON.stringify({
        generated_at: "2026-09-01",
        scan_roots: ["/projects/example"],
        enrichment: {
          state: "mystery",
          metrics: { unique_candidates: 2, prompt_tokens: null, total_tokens: 4 },
        },
        projects: [
          {
            path: "/projects/example",
            ecosystems: ["node"],
            manifests: ["package.json"],
            warnings: [],
            errors: [],
            updates: [
              {
                ecosystem: "node",
                package: "demo",
                current: "1.0.0",
                wanted: "1.0.0",
                latest: "2.0.0",
                dependency_type: "",
                release_info: { ai_warning: "AI unavailable" },
              },
            ],
          },
        ],
      })
    );
    const result = await report.readLatestDependencyReport(dataDir);
    assert.equal(result.enrichmentState, null);
    assert.equal(result.enrichmentMetrics.uniqueCandidates, 2);
    assert.equal(result.enrichmentMetrics.promptTokens, null);
    assert.equal(result.projects[0].updates[0].releaseInfo.aiWarning, "AI unavailable");
  } finally {
    if (previous === undefined) delete process.env.DEPENDENCY_REPORT_OUTPUT_DIR;
    else process.env.DEPENDENCY_REPORT_OUTPUT_DIR = previous;
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});
