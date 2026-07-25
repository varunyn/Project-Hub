import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import dependency_reporter


class DiscoveryTests(unittest.TestCase):
    def test_discovers_multiple_projects_and_skips_ignored_dirs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            node_project = root / "node-app"
            python_project = root / "tools" / "py-app"
            ignored_project = root / "node_modules" / "ignored"
            node_project.mkdir()
            python_project.mkdir(parents=True)
            ignored_project.mkdir(parents=True)
            (node_project / "package.json").write_text('{"dependencies":{"react":"18.2.0"}}')
            (python_project / "requirements.txt").write_text("requests==2.31.0\n")
            (ignored_project / "package.json").write_text("{}")

            projects = dependency_reporter.discover_projects(
                [root],
                ignore_dirs={"node_modules", ".git", ".venv", "venv"},
            )

        paths = {project.path for project in projects}
        self.assertEqual(paths, {node_project, python_project})
        node = next(project for project in projects if project.path == node_project)
        python = next(project for project in projects if project.path == python_project)
        self.assertEqual(node.ecosystems, ["node"])
        self.assertEqual(python.ecosystems, ["python"])


class ConfigTests(unittest.TestCase):
    def test_load_config_reads_scan_roots_output_dir_and_ignored_dirs(self):
        with tempfile.TemporaryDirectory() as tmp:
            config_path = Path(tmp) / "config.yaml"
            config_path.write_text(
                "scan_roots:\n"
                "  - /tmp/example-projects\n"
                "output_dir: outputs\n"
                "ignore_dirs:\n"
                "  - .git\n"
                "  - node_modules\n"
            )

            config = dependency_reporter.load_config(config_path)

        self.assertEqual(config.scan_roots, [Path("/tmp/example-projects")])
        self.assertEqual(config.output_dir, Path("outputs"))
        self.assertEqual(config.ignore_dirs, {".git", "node_modules"})

    def test_load_config_reads_release_intelligence_and_ai_settings(self):
        with tempfile.TemporaryDirectory() as tmp:
            config_path = Path(tmp) / "config.yaml"
            config_path.write_text(
                "scan_roots:\n"
                "  - /tmp/projects\n"
                "release_intelligence:\n"
                "  enabled: true\n"
                "  max_packages: 12\n"
                "ai:\n"
                "  enabled: true\n"
                "  base_url: http://localhost:11434/v1\n"
                "  model: llama3.1\n"
                "  api_key_env: OLLAMA_API_KEY\n"
            )

            config = dependency_reporter.load_config(config_path)

        self.assertTrue(config.release_intelligence.enabled)
        self.assertEqual(config.release_intelligence.max_packages, 12)
        self.assertTrue(config.ai.enabled)
        self.assertEqual(config.ai.base_url, "http://localhost:11434/v1")
        self.assertEqual(config.ai.model, "llama3.1")
        self.assertEqual(config.ai.api_key_env, "OLLAMA_API_KEY")


class ParsingTests(unittest.TestCase):
    def test_parse_npm_outdated_json(self):
        raw = (
            '{"react":{"current":"18.2.0","wanted":"18.3.1","latest":"19.1.0",'
            '"type":"dependencies"}}'
        )

        updates = dependency_reporter.parse_npm_outdated(raw)

        self.assertEqual(len(updates), 1)
        self.assertEqual(updates[0].package, "react")
        self.assertEqual(updates[0].current, "18.2.0")
        self.assertEqual(updates[0].wanted, "18.3.1")
        self.assertEqual(updates[0].latest, "19.1.0")
        self.assertEqual(updates[0].dependency_type, "dependencies")

    def test_parse_npm_outdated_uses_declared_range_when_current_is_blank(self):
        raw = (
            '{"react":{"wanted":"19.2.4","latest":"19.2.7","type":"dependencies"},'
            '"transitive-only":{"wanted":"1.0.0","latest":"2.0.0","type":"dependencies"}}'
        )

        updates = dependency_reporter.parse_npm_outdated(raw, direct_dependencies={"react": "^19.2.0"})

        self.assertEqual(len(updates), 1)
        self.assertEqual(updates[0].package, "react")
        self.assertEqual(updates[0].current, "^19.2.0")

    def test_parse_pnpm_outdated_array_json(self):
        raw = (
            '[{"name":"next","current":"16.2.6","wanted":"16.2.6","latest":"16.2.9","dependencyType":"dependencies"},'
            '{"name":"transitive-only","current":"1.0.0","wanted":"1.0.0","latest":"2.0.0","dependencyType":"dependencies"}]'
        )

        updates = dependency_reporter.parse_node_outdated(raw, direct_dependencies={"next": "16.2.6"})

        self.assertEqual(len(updates), 1)
        self.assertEqual(updates[0].package, "next")
        self.assertEqual(updates[0].current, "16.2.6")
        self.assertEqual(updates[0].wanted, "16.2.6")
        self.assertEqual(updates[0].latest, "16.2.9")
        self.assertEqual(updates[0].dependency_type, "dependencies")

    def test_parse_pip_outdated_json(self):
        raw = '[{"name":"requests","version":"2.31.0","latest_version":"2.32.4","latest_filetype":"wheel"}]'

        updates = dependency_reporter.parse_pip_outdated(raw)

        self.assertEqual(len(updates), 1)
        self.assertEqual(updates[0].package, "requests")
        self.assertEqual(updates[0].current, "2.31.0")
        self.assertEqual(updates[0].wanted, "")
        self.assertEqual(updates[0].latest, "2.32.4")
        self.assertEqual(updates[0].dependency_type, "wheel")

    def test_parse_pip_outdated_filters_to_declared_direct_dependencies(self):
        raw = (
            '[{"name":"fastapi","version":"0.128.0","latest_version":"0.129.0","latest_filetype":"wheel"},'
            '{"name":"python-dotenv","version":"1.2.0","latest_version":"1.2.1","latest_filetype":"wheel"},'
            '{"name":"starlette","version":"0.49.1","latest_version":"0.50.0","latest_filetype":"wheel"}]'
        )

        updates = dependency_reporter.parse_pip_outdated(raw, direct_dependencies={"fastapi", "python_dotenv"})

        self.assertEqual([update.package for update in updates], ["fastapi", "python-dotenv"])

    def test_collects_runtime_dependencies_from_pyproject(self):
        with tempfile.TemporaryDirectory() as tmp:
            project_dir = Path(tmp)
            (project_dir / "pyproject.toml").write_text(
                "[project]\n"
                "dependencies = [\n"
                "  'fastapi>=0.128.0',\n"
                "  'python-dotenv>=1.2.0',\n"
                "]\n"
                "[tool.uv]\n"
                "dev-dependencies = ['pytest>=9.0.2']\n"
            )

            dependencies = dependency_reporter.collect_direct_python_dependencies(project_dir)

        self.assertEqual(dependencies, {"fastapi", "python-dotenv"})

    def test_collects_runtime_dependencies_from_poetry_pyproject(self):
        with tempfile.TemporaryDirectory() as tmp:
            project_dir = Path(tmp)
            (project_dir / "pyproject.toml").write_text(
                "[tool.poetry.dependencies]\n"
                "python = '^3.12'\n"
                "fastapi = '^0.128.0'\n"
                "python-dotenv = '^1.2.0'\n"
                "[tool.poetry.group.dev.dependencies]\n"
                "pytest = '^9.0.2'\n"
            )

            dependencies = dependency_reporter.collect_direct_python_dependencies(project_dir)

        self.assertEqual(dependencies, {"fastapi", "python-dotenv"})

    def test_check_project_uses_uv_lock_when_local_python_is_unusable(self):
        with tempfile.TemporaryDirectory() as tmp:
            project_dir = Path(tmp)
            (project_dir / "pyproject.toml").write_text(
                "[project]\n"
                "dependencies = [\n"
                "  'fastapi>=0.128.0',\n"
                "  'python-dotenv>=1.2.0',\n"
                "]\n"
            )
            (project_dir / "uv.lock").write_text(
                "[[package]]\n"
                'name = "fastapi"\n'
                'version = "0.128.0"\n'
                "\n"
                "[[package]]\n"
                'name = "python-dotenv"\n'
                'version = "1.2.0"\n'
                "\n"
                "[[package]]\n"
                'name = "starlette"\n'
                'version = "0.49.1"\n'
            )
            project = dependency_reporter.Project(project_dir, ["python"], ["pyproject.toml"])

            def latest_version(package):
                return {"fastapi": "0.129.0", "python-dotenv": "1.2.0"}.get(package)

            result = dependency_reporter.check_project(
                project,
                runner=lambda command, cwd: self.fail("runner should not be called"),
                python_latest_version_fetcher=latest_version,
            )

        self.assertEqual(result.warnings, [])
        self.assertEqual(result.errors, [])
        self.assertEqual(len(result.updates), 1)
        self.assertEqual(result.updates[0].package, "fastapi")
        self.assertEqual(result.updates[0].current, "0.128.0")
        self.assertEqual(result.updates[0].latest, "0.129.0")
        self.assertEqual(result.updates[0].dependency_type, "uv.lock")

    def test_collects_direct_dependencies_from_requirements(self):
        with tempfile.TemporaryDirectory() as tmp:
            project_dir = Path(tmp)
            (project_dir / "requirements.txt").write_text(
                "# comment\n"
                "requests[security]>=2.31.0\n"
                "python-dotenv==1.2.0 # inline comment\n"
                "-r dev-requirements.txt\n"
            )

            dependencies = dependency_reporter.collect_direct_python_dependencies(project_dir)

        self.assertEqual(dependencies, {"requests", "python-dotenv"})

    def test_parse_pypi_release_metadata_extracts_dates_and_links(self):
        update = dependency_reporter.DependencyUpdate("python", "fastapi", "0.128.0", "", "0.129.0", "wheel")
        metadata = {
            "info": {
                "home_page": "https://fastapi.tiangolo.com/",
                "project_urls": {
                    "Changelog": "https://fastapi.tiangolo.com/release-notes/",
                    "Source": "https://github.com/fastapi/fastapi",
                },
            },
            "releases": {
                "0.128.0": [{"upload_time_iso_8601": "2026-01-01T00:00:00Z"}],
                "0.129.0": [{"upload_time_iso_8601": "2026-02-01T00:00:00Z"}],
            },
        }

        release_info = dependency_reporter.parse_pypi_release_metadata(update, metadata)

        self.assertEqual(release_info.current_release_date, "2026-01-01T00:00:00Z")
        self.assertEqual(release_info.latest_release_date, "2026-02-01T00:00:00Z")
        self.assertEqual(release_info.homepage_url, "https://fastapi.tiangolo.com/")
        self.assertEqual(release_info.repository_url, "https://github.com/fastapi/fastapi")
        self.assertEqual(release_info.changelog_url, "https://fastapi.tiangolo.com/release-notes/")

    def test_parse_npm_release_metadata_extracts_dates_and_links(self):
        update = dependency_reporter.DependencyUpdate("node", "react", "18.2.0", "18.3.1", "19.1.0", "dependencies")
        metadata = {
            "homepage": "https://react.dev/",
            "repository": {"url": "git+https://github.com/facebook/react.git"},
            "time": {
                "18.2.0": "2022-06-14T19:46:43.369Z",
                "19.1.0": "2026-02-01T00:00:00.000Z",
            },
        }

        release_info = dependency_reporter.parse_npm_release_metadata(update, metadata)

        self.assertEqual(release_info.current_release_date, "2022-06-14T19:46:43.369Z")
        self.assertEqual(release_info.latest_release_date, "2026-02-01T00:00:00.000Z")
        self.assertEqual(release_info.homepage_url, "https://react.dev/")
        self.assertEqual(release_info.repository_url, "https://github.com/facebook/react")

    def test_fetch_release_text_strips_html_and_limits_excerpt(self):
        html = b"<html><body><h1>Release Notes</h1><p>Added routing fixes.</p><script>ignore()</script></body></html>"

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, traceback):
                return False

            def read(self):
                return html

        with patch("dependency_reporter.urllib.request.urlopen", return_value=FakeResponse()):
            text = dependency_reporter.fetch_release_text("https://example.com/releases", max_chars=80)

        self.assertIn("Release Notes", text)
        self.assertIn("Added routing fixes.", text)
        self.assertNotIn("ignore()", text)


class ReleaseIntelligenceTests(unittest.TestCase):
    def test_enrich_results_attaches_release_metadata_and_ai_summary_when_enabled(self):
        project = dependency_reporter.Project(Path("/tmp/app"), ["python"], ["pyproject.toml"])
        update = dependency_reporter.DependencyUpdate("python", "fastapi", "0.128.0", "", "0.129.0", "wheel")
        result = dependency_reporter.ProjectResult(project=project, updates=[update])
        config = dependency_reporter.Config(
            scan_roots=[Path("/tmp")],
            output_dir=Path("outputs"),
            ignore_dirs=set(),
            release_intelligence=dependency_reporter.ReleaseIntelligenceConfig(enabled=True),
            ai=dependency_reporter.AIConfig(enabled=True, base_url="http://localhost:11434/v1", model="llama3.1"),
        )

        def metadata_fetcher(update):
            return dependency_reporter.ReleaseInfo(
                current_release_date="2026-01-01T00:00:00Z",
                latest_release_date="2026-02-01T00:00:00Z",
                homepage_url="https://fastapi.tiangolo.com/",
                repository_url="",
                changelog_url="https://fastapi.tiangolo.com/release-notes/",
            )

        def ai_summarizer(update, release_info, ai_config):
            self.assertEqual(update.package, "fastapi")
            self.assertEqual(ai_config.model, "llama3.1")
            self.assertEqual(release_info.changelog_url, "https://fastapi.tiangolo.com/release-notes/")
            return "Review FastAPI release notes for routing changes."

        dependency_reporter.enrich_results_with_release_intelligence(
            [result],
            config,
            metadata_fetcher=metadata_fetcher,
            release_text_fetcher=lambda url: "",
            ai_summarizer=ai_summarizer,
        )

        self.assertEqual(update.release_info.latest_release_date, "2026-02-01T00:00:00Z")
        self.assertEqual(update.release_info.ai_summary, "Review FastAPI release notes for routing changes.")

    def test_enrich_results_fetches_release_notes_before_ai_summary(self):
        project = dependency_reporter.Project(Path("/tmp/app"), ["python"], ["pyproject.toml"])
        update = dependency_reporter.DependencyUpdate("python", "fastapi", "0.128.0", "", "0.129.0", "wheel")
        result = dependency_reporter.ProjectResult(project=project, updates=[update])
        config = dependency_reporter.Config(
            scan_roots=[Path("/tmp")],
            output_dir=Path("outputs"),
            ignore_dirs=set(),
            release_intelligence=dependency_reporter.ReleaseIntelligenceConfig(enabled=True),
            ai=dependency_reporter.AIConfig(enabled=True),
        )

        def ai_summarizer(update, release_info, ai_config):
            self.assertIn("Added routing fixes.", release_info.release_notes_excerpt)
            return '{"priority":"review-first","risk":"medium","suggested_action":"Review routing changes","notable_changes":["Routing fixes"],"breaking_changes":[],"evidence_urls":["https://example.com/releases"]}'

        dependency_reporter.enrich_results_with_release_intelligence(
            [result],
            config,
            metadata_fetcher=lambda dependency_update: dependency_reporter.ReleaseInfo(changelog_url="https://example.com/releases"),
            release_text_fetcher=lambda url: "Added routing fixes.",
            ai_summarizer=ai_summarizer,
        )

        self.assertEqual(update.release_info.release_notes_excerpt, "Added routing fixes.")
        self.assertEqual(update.release_info.ai_priority, "review-first")
        self.assertEqual(update.release_info.ai_risk, "medium")
        self.assertEqual(update.release_info.ai_suggested_action, "Review routing changes")
        self.assertEqual(update.release_info.ai_notable_changes, ["Routing fixes"])

    def test_ai_summary_extracts_json_from_fenced_model_response(self):
        release_info = dependency_reporter.ReleaseInfo()
        raw_summary = (
            "Here is the summary in strict JSON format:\n\n"
            "```json\n"
            "{\n"
            '  "priority": "update-now",\n'
            '  "risk": "medium",\n'
            '  "suggested_action": "Upgrade because this fixes a DoS issue.",\n'
            '  "notable_changes": ["Fixed a remote memory exhaustion DoS vulnerability"],\n'
            '  "breaking_changes": [],\n'
            '  "evidence_urls": ["https://github.com/websockets/ws/releases"],\n'
            '  "summary": "Security fix."\n'
            "}\n"
            "```"
        )

        dependency_reporter._apply_ai_summary(release_info, raw_summary)

        self.assertEqual(release_info.ai_priority, "update-now")
        self.assertEqual(release_info.ai_risk, "medium")
        self.assertEqual(release_info.ai_suggested_action, "Upgrade because this fixes a DoS issue.")
        self.assertEqual(release_info.ai_notable_changes, ["Fixed a remote memory exhaustion DoS vulnerability"])
        self.assertEqual(release_info.ai_evidence_urls, ["https://github.com/websockets/ws/releases"])
        self.assertEqual(release_info.ai_summary, "Security fix.")

    def test_ai_summary_infers_priority_and_risk_when_model_omits_them(self):
        release_info = dependency_reporter.ReleaseInfo()
        raw_summary = (
            "{"
            '"notable_changes":["Added pagination support"],'
            '"breaking_changes":["Removed LangChain callback handler integration"],'
            '"evidence_urls":["https://docs.streamlit.io/develop/quick-reference/changelog"]'
            "}"
        )

        dependency_reporter._apply_ai_summary(release_info, raw_summary)

        self.assertEqual(release_info.ai_priority, "high")
        self.assertEqual(release_info.ai_risk, "high")

    def test_enrich_results_skips_ai_when_disabled(self):
        project = dependency_reporter.Project(Path("/tmp/app"), ["node"], ["package.json"])
        update = dependency_reporter.DependencyUpdate("node", "react", "18.2.0", "18.3.1", "19.1.0", "dependencies")
        result = dependency_reporter.ProjectResult(project=project, updates=[update])
        config = dependency_reporter.Config(
            scan_roots=[Path("/tmp")],
            output_dir=Path("outputs"),
            ignore_dirs=set(),
            release_intelligence=dependency_reporter.ReleaseIntelligenceConfig(enabled=True),
            ai=dependency_reporter.AIConfig(enabled=False),
        )

        dependency_reporter.enrich_results_with_release_intelligence(
            [result],
            config,
            metadata_fetcher=lambda dependency_update: dependency_reporter.ReleaseInfo(homepage_url="https://react.dev/"),
            ai_summarizer=lambda update, release_info, ai_config: self.fail("AI summarizer should not be called"),
        )

        self.assertEqual(update.release_info.homepage_url, "https://react.dev/")
        self.assertEqual(update.release_info.ai_summary, "")

    def test_ai_summary_allows_endpoint_without_api_key(self):
        update = dependency_reporter.DependencyUpdate("python", "fastapi", "0.128.0", "", "0.129.0", "wheel")
        release_info = dependency_reporter.ReleaseInfo(changelog_url="https://fastapi.tiangolo.com/release-notes/")
        ai_config = dependency_reporter.AIConfig(
            enabled=True,
            base_url="https://llm.internal/v1",
            model="local-model",
            api_key_env="",
        )

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, traceback):
                return False

            def read(self):
                return b'{"choices":[{"message":{"content":"Review routing changes."}}]}'

        def fake_urlopen(request, timeout):
            self.assertEqual(request.full_url, "https://llm.internal/v1/chat/completions")
            self.assertIsNone(request.get_header("Authorization"))
            self.assertEqual(request.get_header("Content-type"), "application/json")
            self.assertEqual(timeout, 60)
            return FakeResponse()

        with patch("dependency_reporter.urllib.request.urlopen", side_effect=fake_urlopen):
            summary = dependency_reporter.summarize_update_with_ai(update, release_info, ai_config)

        self.assertEqual(summary, "Review routing changes.")


class RunCommandTests(unittest.TestCase):
    def test_run_command_converts_permission_error_to_result(self):
        with tempfile.TemporaryDirectory() as tmp:
            cwd = Path(tmp)
            with patch("dependency_reporter.subprocess.run", side_effect=PermissionError("denied")) as run:
                result = dependency_reporter.run_command(["npm", "outdated"], cwd)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("denied", result.stderr)
        self.assertEqual(run.call_args.kwargs["timeout"], dependency_reporter.COMMAND_TIMEOUT_SECONDS)

    def test_run_command_converts_timeout_to_result(self):
        command = ["npm", "outdated"]
        timeout = 120
        with tempfile.TemporaryDirectory() as tmp:
            cwd = Path(tmp)
            with patch(
                "dependency_reporter.subprocess.run",
                side_effect=subprocess.TimeoutExpired(cmd=command, timeout=timeout),
            ):
                result = dependency_reporter.run_command(command, cwd)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("timeout", result.stderr.lower())


class CheckProjectTests(unittest.TestCase):
    def test_check_project_collects_node_updates_from_npm_json_even_with_exit_one(self):
        with tempfile.TemporaryDirectory() as tmp:
            project_dir = Path(tmp)
            (project_dir / "package.json").write_text('{"dependencies":{"react":"18"}}')
            project = dependency_reporter.Project(project_dir, ["node"], ["package.json"])

            def runner(command, cwd):
                self.assertEqual(command, ["npm", "outdated", "--json"])
                self.assertEqual(cwd, project_dir)
                return dependency_reporter.CommandResult(1, '{"react":{"current":"18","wanted":"18","latest":"19"}}', "")

            result = dependency_reporter.check_project(project, runner)

        self.assertEqual([update.package for update in result.updates], ["react"])
        self.assertEqual(result.errors, [])

    def test_check_project_uses_node_manifest_range_when_npm_current_is_blank(self):
        with tempfile.TemporaryDirectory() as tmp:
            project_dir = Path(tmp)
            (project_dir / "package.json").write_text('{"dependencies":{"react":"^19.2.0"}}')
            project = dependency_reporter.Project(project_dir, ["node"], ["package.json"])

            def runner(command, cwd):
                self.assertEqual(command, ["npm", "outdated", "--json"])
                self.assertEqual(cwd, project_dir)
                return dependency_reporter.CommandResult(
                    1,
                    '{"react":{"wanted":"19.2.4","latest":"19.2.7","type":"dependencies"}}',
                    "",
                )

            result = dependency_reporter.check_project(project, runner)

        self.assertEqual(result.updates[0].current, "^19.2.0")

    def test_check_project_uses_pnpm_outdated_for_pnpm_project(self):
        with tempfile.TemporaryDirectory() as tmp:
            project_dir = Path(tmp)
            (project_dir / "package.json").write_text('{"dependencies":{"next":"16.2.6"}}')
            (project_dir / "pnpm-lock.yaml").write_text("lockfileVersion: '9.0'\n")
            project = dependency_reporter.Project(project_dir, ["node"], ["package.json"])

            def runner(command, cwd):
                self.assertEqual(command, ["pnpm", "outdated", "--format", "json"])
                self.assertEqual(cwd, project_dir)
                return dependency_reporter.CommandResult(
                    1,
                    '[{"name":"next","wanted":"16.2.6","latest":"16.2.9","dependencyType":"dependencies"}]',
                    "",
                )

            result = dependency_reporter.check_project(project, runner)

        self.assertEqual(result.warnings, [])
        self.assertEqual(result.errors, [])
        self.assertEqual(result.updates[0].package, "next")
        self.assertEqual(result.updates[0].current, "16.2.6")

    def test_check_project_includes_raw_output_when_pnpm_json_parse_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            project_dir = Path(tmp)
            (project_dir / "package.json").write_text('{"dependencies":{"next":"16.2.6"}}')
            (project_dir / "pnpm-lock.yaml").write_text("lockfileVersion: '9.0'\n")
            project = dependency_reporter.Project(project_dir, ["node"], ["package.json"])

            def runner(command, cwd):
                return dependency_reporter.CommandResult(1, "Packages are up to date", "pnpm warning")

            result = dependency_reporter.check_project(project, runner)

        self.assertIn("Could not parse pnpm outdated JSON", result.errors[0])
        self.assertIn("stdout: Packages are up to date", result.errors[0])
        self.assertIn("stderr: pnpm warning", result.errors[0])

    def test_check_project_warns_when_python_project_has_no_local_venv(self):
        with tempfile.TemporaryDirectory() as tmp:
            project_dir = Path(tmp)
            (project_dir / "requirements.txt").write_text("requests==2.31.0\n")
            project = dependency_reporter.Project(project_dir, ["python"], ["requirements.txt"])

            result = dependency_reporter.check_project(project, lambda command, cwd: self.fail("runner should not be called"))

        self.assertEqual(result.updates, [])
        self.assertEqual(
            result.warnings,
            ["No runnable local Python environment or uv.lock found for Python dependency scan"],
        )

    def test_check_project_uses_uv_for_uv_project_with_local_venv(self):
        with tempfile.TemporaryDirectory() as tmp:
            project_dir = Path(tmp)
            python_path = project_dir / ".venv" / "bin" / "python"
            python_path.parent.mkdir(parents=True)
            python_path.write_text("")
            (project_dir / "pyproject.toml").write_text("[project]\nname = 'demo'\ndependencies = ['requests>=2']\n")
            (project_dir / "uv.lock").write_text("")
            project = dependency_reporter.Project(project_dir, ["python"], ["pyproject.toml"])

            def runner(command, cwd):
                self.assertEqual(
                    command,
                    ["uv", "pip", "list", "--outdated", "--format=json", "--python", str(python_path)],
                )
                self.assertEqual(cwd, project_dir)
                return dependency_reporter.CommandResult(
                    0,
                    '[{"name":"requests","version":"2.31.0","latest_version":"2.32.4","latest_filetype":"wheel"}]',
                    "",
                )

            result = dependency_reporter.check_project(project, runner)

        self.assertEqual([update.package for update in result.updates], ["requests"])
        self.assertEqual(result.errors, [])

    def test_check_project_uses_pip_for_non_uv_project_with_local_venv(self):
        with tempfile.TemporaryDirectory() as tmp:
            project_dir = Path(tmp)
            python_path = project_dir / ".venv" / "bin" / "python"
            python_path.parent.mkdir(parents=True)
            python_path.write_text("")
            (project_dir / "requirements.txt").write_text("requests==2.31.0\n")
            project = dependency_reporter.Project(project_dir, ["python"], ["requirements.txt"])

            def runner(command, cwd):
                self.assertEqual(command, [str(python_path), "-m", "pip", "list", "--outdated", "--format=json"])
                self.assertEqual(cwd, project_dir)
                return dependency_reporter.CommandResult(0, "[]", "")

            result = dependency_reporter.check_project(project, runner)

        self.assertEqual(result.updates, [])
        self.assertEqual(result.errors, [])


class ReportTests(unittest.TestCase):
    def test_write_reports_creates_markdown_and_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            output_dir = Path(tmp) / "reports"
            project = dependency_reporter.Project(Path("/tmp/app"), ["node"], ["package.json"])
            update = dependency_reporter.DependencyUpdate("node", "react", "18.2.0", "18.3.1", "19.1.0", "dependencies")
            project_result = dependency_reporter.ProjectResult(project=project, updates=[update])

            paths = dependency_reporter.write_reports(
                [project_result],
                scan_roots=[Path("/tmp")],
                output_dir=output_dir,
                date_string="2026-06-16",
            )

            markdown = paths["markdown"].read_text()
            report_json = paths["json"].read_text()
        self.assertIn("# Dependency Report - 2026-06-16", markdown)
        self.assertIn("| react | 18.2.0 | 18.3.1 | 19.1.0 | dependencies |", markdown)
        self.assertIn('"package": "react"', report_json)

    def test_write_reports_puts_projects_with_updates_before_errors(self):
        with tempfile.TemporaryDirectory() as tmp:
            output_dir = Path(tmp) / "reports"
            update_project = dependency_reporter.Project(Path("/tmp/node-app"), ["node"], ["package.json"])
            error_project = dependency_reporter.Project(Path("/tmp/python-app"), ["python"], ["pyproject.toml"])
            update = dependency_reporter.DependencyUpdate("node", "react", "18.2.0", "18.3.1", "19.1.0", "dependencies")
            results = [
                dependency_reporter.ProjectResult(project=error_project, errors=["python: No module named pip"]),
                dependency_reporter.ProjectResult(project=update_project, updates=[update]),
            ]

            paths = dependency_reporter.write_reports(
                results,
                scan_roots=[Path("/tmp")],
                output_dir=output_dir,
                date_string="2026-06-16",
            )

            markdown = paths["markdown"].read_text()

        updates_section = markdown.index("## Projects With Updates")
        project_details_section = markdown.index("## Project Details")
        first_error = markdown.index("python: No module named pip")
        self.assertLess(updates_section, project_details_section)
        self.assertLess(updates_section, first_error)
        self.assertIn("### /tmp/node-app", markdown[updates_section:project_details_section])

    def test_write_reports_renders_upgrade_planning_when_release_info_exists(self):
        with tempfile.TemporaryDirectory() as tmp:
            output_dir = Path(tmp) / "reports"
            project = dependency_reporter.Project(Path("/tmp/app"), ["python"], ["pyproject.toml"])
            update = dependency_reporter.DependencyUpdate(
                "python",
                "fastapi",
                "0.128.0",
                "",
                "0.129.0",
                "wheel",
                release_info=dependency_reporter.ReleaseInfo(
                    latest_release_date="2026-02-01T00:00:00Z",
                    homepage_url="https://fastapi.tiangolo.com/",
                    changelog_url="https://fastapi.tiangolo.com/release-notes/",
                    ai_summary="Worth reviewing for API routing improvements.",
                ),
            )
            paths = dependency_reporter.write_reports(
                [dependency_reporter.ProjectResult(project=project, updates=[update])],
                scan_roots=[Path("/tmp")],
                output_dir=output_dir,
                date_string="2026-06-16",
            )

            markdown = paths["markdown"].read_text()
            report_json = paths["json"].read_text()

        self.assertIn("## Upgrade Planning", markdown)
        self.assertIn(
            "| /tmp/app | fastapi | python | 0.128.0 | 0.129.0 | 2026-02-01T00:00:00Z |",
            markdown,
        )
        self.assertIn("Worth reviewing for API routing improvements.", markdown)
        self.assertIn('"release_info"', report_json)

    def test_write_reports_renders_structured_upgrade_notes(self):
        with tempfile.TemporaryDirectory() as tmp:
            output_dir = Path(tmp) / "reports"
            project = dependency_reporter.Project(Path("/tmp/app"), ["python"], ["pyproject.toml"])
            update = dependency_reporter.DependencyUpdate(
                "python",
                "fastapi",
                "0.128.0",
                "",
                "0.129.0",
                "wheel",
                release_info=dependency_reporter.ReleaseInfo(
                    ai_priority="review-first",
                    ai_risk="medium",
                    ai_suggested_action="Review routing changes",
                    ai_notable_changes=["Routing fixes"],
                    ai_breaking_changes=["Check middleware behavior"],
                ),
            )
            paths = dependency_reporter.write_reports(
                [dependency_reporter.ProjectResult(project=project, updates=[update])],
                scan_roots=[Path("/tmp")],
                output_dir=output_dir,
                date_string="2026-06-16",
            )

            markdown = paths["markdown"].read_text()

        self.assertIn("| /tmp/app | fastapi | review-first | medium | Review routing changes |", markdown)
        self.assertIn("Routing fixes", markdown)
        self.assertIn("Check middleware behavior", markdown)


if __name__ == "__main__":
    unittest.main()
