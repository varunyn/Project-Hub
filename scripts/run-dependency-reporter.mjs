import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const appRoot = path.resolve(new URL("..", import.meta.url).pathname);
const projectsPath =
  process.env.PROJECTS_JSON_PATH || path.join(appRoot, "app", "data", "projects.json");
const reporterRoot =
  process.env.DEPENDENCY_REPORTER_PATH || path.join(appRoot, "tools", "dependency-reporter");
const reporterScript =
  process.env.DEPENDENCY_REPORT_SCRIPT || path.join(reporterRoot, "dependency_reporter.py");
const outputDir = process.env.DEPENDENCY_REPORT_OUTPUT_DIR || path.join(appRoot, "outputs");
const python = process.env.DEPENDENCY_REPORT_PYTHON || "python3";
const toolPath = [
  path.join(os.homedir(), ".local", "bin"),
  path.join(os.homedir(), ".cargo", "bin"),
  "/opt/homebrew/bin",
  "/usr/local/bin",
  process.env.PATH || "",
].join(path.delimiter);

function yamlList(values) {
  return values.map((value) => `  - ${value}`).join("\n");
}

function boolEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value === "true";
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function buildConfig(scanRoots) {
  const aiBaseUrl = process.env.DEPENDENCY_REPORT_AI_BASE_URL || "http://localhost:3001/v1";
  const aiModel = process.env.DEPENDENCY_REPORT_AI_MODEL || "meta.llama-4-scout-17b-16e-instruct";
  const aiKeyEnv = process.env.DEPENDENCY_REPORT_AI_KEY_ENV || "";

  return [
    "scan_roots:",
    yamlList(scanRoots),
    `output_dir: ${outputDir}`,
    "ignore_dirs:",
    yamlList([
      ".git",
      "node_modules",
      ".pnpm-store",
      ".venv",
      "venv",
      "__pycache__",
      "dist",
      "build",
      ".next",
    ]),
    "release_intelligence:",
    `  enabled: ${boolEnv("DEPENDENCY_REPORT_RELEASE_INTELLIGENCE_ENABLED", true)}`,
    `  max_packages: ${numberEnv("DEPENDENCY_REPORT_RELEASE_MAX_PACKAGES", 25)}`,
    "ai:",
    `  enabled: ${boolEnv("DEPENDENCY_REPORT_AI_ENABLED", false)}`,
    `  base_url: ${aiBaseUrl}`,
    `  model: ${aiModel}`,
    `  api_key_env: ${aiKeyEnv}`,
    "",
  ].join("\n");
}

const projects = JSON.parse(fs.readFileSync(projectsPath, "utf8"));
const scanRoots = Array.from(
  new Set(projects.map((project) => project.path).filter((value) => typeof value === "string"))
);

if (scanRoots.length === 0) {
  console.error(`No project paths found in ${projectsPath}`);
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-tracker-dependency-report-"));
const configPath = path.join(tmpDir, "config.yaml");
fs.writeFileSync(configPath, buildConfig(scanRoots), "utf8");

console.log(`Running dependency reporter for ${scanRoots.length} project path(s).`);
console.log(`${python} "${reporterScript}" --config "${configPath}"`);

const result = spawnSync(python, [reporterScript, "--config", configPath], {
  cwd: reporterRoot,
  encoding: "utf8",
  env: { ...process.env, PATH: toolPath },
  stdio: "inherit",
});

fs.rmSync(tmpDir, { force: true, recursive: true });
process.exit(result.status ?? 1);
