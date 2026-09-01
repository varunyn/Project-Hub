import json
import threading
import time
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from urllib.error import HTTPError

import dependency_reporter
from dependency_reporter_lib import cli, release_intelligence


def _config(cache_path=None, *, model="test-model", prompt_schema="dependency-summary-v1", max_packages=25):
    return dependency_reporter.Config(
        scan_roots=[Path("/scan")],
        output_dir=Path("/output"),
        ignore_dirs=set(),
        release_intelligence=dependency_reporter.ReleaseIntelligenceConfig(
            enabled=True, max_packages=max_packages, evidence_max_chars=2000, cache_path=cache_path
        ),
        ai=dependency_reporter.AIConfig(
            enabled=True, model=model, prompt_schema=prompt_schema, completion_tokens=77
        ),
    )


def _update(package, current="1.0.0", evidence=None):
    return dependency_reporter.DependencyUpdate(
        "node", package, current, "1.1.0", "2.0.0", "dependencies",
        dependency_reporter.ReleaseInfo(
            release_notes_excerpt=evidence if evidence is not None else f"{package} fixes bugs",
            source="fixture",
        ),
    )


class AIEnrichmentOptimizationTests(unittest.TestCase):
    def test_equivalent_rows_are_preserved_fanned_out_and_capped_by_unique_groups(self):
        rows = [_update(f"pkg-{index}") for index in range(7) for _ in range(3)]
        results = [
            dependency_reporter.ProjectResult(
                dependency_reporter.Project(Path(f"/project-{index}"), ["node"]),
                rows[index * 7 : (index + 1) * 7],
            )
            for index in range(3)
        ]
        calls = []

        def summarize(update, release_info, config):
            calls.append(update.package)
            return json.dumps({"summary": f"summary for {update.package}"})

        metrics = dependency_reporter.enrich_results_with_release_intelligence(
            results, _config(max_packages=7), metadata_fetcher=lambda update: update.release_info,
            ai_summarizer=summarize,
        )

        self.assertEqual(len(calls), 7)
        self.assertEqual(metrics["unique_candidates"], 7)
        self.assertEqual(metrics["requests"], 7)
        self.assertEqual(sum(len(result.updates) for result in results), 21)
        for result in results:
            for update in result.updates:
                self.assertEqual(update.release_info.ai_summary, f"summary for {update.package}")

    def test_equivalent_candidates_are_scheduled_concurrently_with_four_worker_ceiling(self):
        updates = [_update(f"pkg-{index}") for index in range(4)]
        result = dependency_reporter.ProjectResult(dependency_reporter.Project(Path("/project"), ["node"]), updates)
        lock = threading.Lock()
        active = 0
        maximum = 0

        def summarize(update, release_info, config):
            nonlocal active, maximum
            with lock:
                active += 1
                maximum = max(maximum, active)
            time.sleep(0.03)
            with lock:
                active -= 1
            return json.dumps({"summary": update.package})

        dependency_reporter.enrich_results_with_release_intelligence(
            [result], _config(), metadata_fetcher=lambda update: update.release_info,
            ai_summarizer=summarize,
        )

        self.assertGreater(maximum, 1)
        self.assertLessEqual(maximum, 4)

    def test_persistent_ai_cache_hits_then_invalidates_on_key_material(self):
        with TemporaryDirectory() as tmp:
            cache_path = Path(tmp) / "cache.json"
            calls = []

            def summarize(update, release_info, config):
                calls.append(update.package)
                return json.dumps({"summary": "cached"})

            def run(update, config):
                result = dependency_reporter.ProjectResult(dependency_reporter.Project(Path("/p"), ["node"]), [update])
                metrics = dependency_reporter.enrich_results_with_release_intelligence(
                    [result], config, metadata_fetcher=lambda item: item.release_info, ai_summarizer=summarize
                )
                return metrics

            first = run(_update("pkg"), _config(cache_path))
            second = run(_update("pkg"), _config(cache_path))
            self.assertEqual(first["requests"], 1)
            self.assertEqual(second["cache_hits"], 1)
            self.assertEqual(len(calls), 1)

            for changed, config in (
                (_update("pkg", current="1.0.1"), _config(cache_path)),
                (_update("pkg", evidence="new evidence"), _config(cache_path)),
                (_update("pkg"), _config(cache_path, model="other-model")),
                (_update("pkg"), _config(cache_path, prompt_schema="dependency-summary-v2")),
            ):
                run(changed, config)
            self.assertEqual(len(calls), 5)

    def test_unsuccessful_or_evidence_free_responses_are_not_cached(self):
        cases = [
            ("malformed", "not-json"),
            ("empty", ""),
            ("failure", RuntimeError("gateway down")),
            ("missing-evidence", json.dumps({"summary": "should not persist"})),
        ]
        for label, response in cases:
            with self.subTest(label=label), TemporaryDirectory() as tmp:
                cache_path = Path(tmp) / "cache.json"
                calls = []

                def summarize(update, release_info, config):
                    calls.append(update.package)
                    if isinstance(response, Exception):
                        raise response
                    return response

                evidence = "" if label == "missing-evidence" else "evidence"
                config = _config(cache_path)
                last_result = None
                for _ in range(2):
                    result = dependency_reporter.ProjectResult(
                        dependency_reporter.Project(Path("/p"), ["node"]), [_update("pkg", evidence=evidence)]
                    )
                    last_result = result
                    if label == "malformed":
                        with patch.object(
                            release_intelligence,
                            "_request_ai",
                            side_effect=lambda update, info, ai_config: (calls.append(update.package) or {"content": response}),
                        ):
                            dependency_reporter.enrich_results_with_release_intelligence(
                                [result], config, metadata_fetcher=lambda item: item.release_info
                            )
                    else:
                        dependency_reporter.enrich_results_with_release_intelligence(
                            [result], config, metadata_fetcher=lambda item: item.release_info, ai_summarizer=summarize
                        )
                self.assertEqual(len(calls), 2)
                if label == "failure":
                    self.assertEqual(last_result.enrichment_state, "partial")
                    self.assertEqual(last_result.enrichment_metrics["failures"], 1)
                    self.assertIn("AI summary unavailable", last_result.updates[0].release_info.ai_warning)

    def test_ai_request_budget_usage_and_optional_field_fallback(self):
        update = _update("pkg")
        config = dependency_reporter.AIConfig(
            enabled=True, base_url="http://localhost:3001/v1", model="model", completion_tokens=41,
            reasoning_effort="low"
        )
        responses = []

        def read_request(request, timeout):
            payload = json.loads(request.data)
            responses.append(payload)
            return json.dumps({"choices": [{"message": {"content": "{}"}}]}).encode()

        with patch.object(release_intelligence, "_read_url", side_effect=read_request):
            release_intelligence._request_ai(update, update.release_info, config)
        self.assertEqual(responses[0]["max_completion_tokens"], 41)
        self.assertEqual(responses[0]["reasoning_effort"], "low")
        self.assertEqual(responses[0]["response_format"], {"type": "json_object"})
        evidence = responses[0]["messages"][1]["content"]
        self.assertLessEqual(len(evidence), 2000 + 5000)  # structured envelope plus bounded evidence

        fallback = []

        def fallback_read(request, timeout):
            payload = json.loads(request.data)
            fallback.append(payload)
            if len(fallback) == 1:
                raise HTTPError(request.full_url, 400, "unsupported", {}, None)
            return json.dumps({"choices": [{"message": {"content": "{}"}}]}).encode()

        with patch.object(release_intelligence, "_read_url", side_effect=fallback_read):
            release_intelligence._request_ai(update, update.release_info, config)
        self.assertNotIn("response_format", fallback[1])
        self.assertNotIn("reasoning_effort", fallback[1])

    def test_outbound_evidence_is_sanitized_and_bounded(self):
        update = _update("pkg", evidence="")
        info = dependency_reporter.ReleaseInfo(changelog_url="https://example.test/notes")
        update.release_info = info
        cache = release_intelligence.TTLCache()
        noisy = "<nav>menu</nav><script>tracking()</script>\n" + ("Relevant fix &amp; detail. " * 100)
        release_intelligence._resolve_changelog(
            update, info, lambda url: noisy, cache, max_chars=73
        )
        self.assertNotIn("<nav>", info.release_notes_excerpt)
        self.assertNotIn("tracking()", info.release_notes_excerpt)
        self.assertLessEqual(len(info.release_notes_excerpt), 73)

        requests = []

        def read_request(request, timeout):
            requests.append(json.loads(request.data))
            return json.dumps({"choices": [{"message": {"content": "{}"}}]}).encode()

        with patch.object(release_intelligence, "_read_url", side_effect=read_request):
            release_intelligence._request_ai(update, info, dependency_reporter.AIConfig(base_url="http://localhost:3001/v1"))
        outbound = json.loads(requests[0]["messages"][1]["content"])
        self.assertEqual(outbound["release_info"]["release_notes_excerpt"], info.release_notes_excerpt)

    def test_usage_variants_are_aggregated_without_fabricating_missing_fields(self):
        for usage, expected_reasoning in (
            ({"prompt_tokens": 2, "completion_tokens": 3, "total_tokens": 5, "completion_tokens_details": {"reasoning_tokens": 1}}, 1),
            ({"prompt_tokens": 2, "completion_tokens": 3, "total_tokens": 5, "output_tokens_details": {"reasoning_tokens": 1}}, 1),
            ({"prompt_tokens": 2, "completion_tokens": 3, "total_tokens": 5}, None),
            ({"prompt_tokens": "unknown", "completion_tokens": -1, "total_tokens": 1.5}, None),
            (None, None),
        ):
            result = dependency_reporter.ProjectResult(dependency_reporter.Project(Path("/p"), ["node"]), [_update("pkg")])
            raw = {"content": "{}", "usage": usage}
            metrics = dependency_reporter.enrich_results_with_release_intelligence(
                [result], _config(), metadata_fetcher=lambda item: item.release_info,
                ai_summarizer=lambda update, info, config, raw=raw: raw,
            )
            self.assertEqual(metrics["reasoning_tokens"], expected_reasoning)
            if isinstance(usage, dict) and usage.get("prompt_tokens") == "unknown":
                self.assertIsNone(metrics["prompt_tokens"])
                self.assertIsNone(metrics["completion_tokens"])
                self.assertIsNone(metrics["total_tokens"])

    def test_cli_writes_deterministic_report_before_ai_and_emits_phases(self):
        config = _config()
        result = dependency_reporter.ProjectResult(dependency_reporter.Project(Path("/p"), ["node"]), [])
        writes = []
        phases = []

        def fake_enrich(results, config, progress_callback=None, before_ai_callback=None):
            progress_callback({"phase": "release_lookup", "completed": 1, "total": 1})
            results[0].enrichment_state = "in_progress"
            before_ai_callback()
            results[0].enrichment_state = "completed"
            progress_callback({"phase": "ai_enrichment", "completed": 1, "total": 1})
            progress_callback({"phase": "finalizing", "completed": 1, "total": 1})
            return {"state": "completed"}

        def fake_write(results, roots, output_dir):
            paths = dependency_reporter.write_reports(results, roots, output_dir, date_string="2026-09-01")
            writes.append(paths["json"].read_text())
            return paths

        with TemporaryDirectory() as tmp, patch.object(cli, "load_config", return_value=config), patch.object(cli, "discover_projects", return_value=[result.project]), patch.object(
            cli, "check_project", return_value=result
        ), patch.object(cli, "enrich_results_with_release_intelligence", side_effect=fake_enrich), patch.object(
            cli, "write_reports", side_effect=fake_write
        ), patch("builtins.print", side_effect=lambda *values, **kwargs: phases.append(" ".join(str(value) for value in values))):
            config.scan_roots = [Path(tmp)]
            config.output_dir = Path(tmp) / "reports"
            self.assertEqual(cli.main(["--config", "config.yaml", "--progress"]), 0, phases)

        self.assertEqual(len(writes), 2)
        self.assertIn('"state": "in_progress"', writes[0] if writes[0] else writes[1])
        self.assertIn('"state": "completed"', writes[-1])
        self.assertTrue(any('"phase": "release_lookup"' in item for item in phases))
        self.assertTrue(any('"phase": "ai_enrichment"' in item for item in phases))
        self.assertTrue(any('"phase": "finalizing"' in item for item in phases))


if __name__ == "__main__":
    unittest.main()
