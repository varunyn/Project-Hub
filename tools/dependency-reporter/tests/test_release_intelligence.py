import unittest
from datetime import timedelta
from unittest.mock import patch

import dependency_reporter
from dependency_reporter_lib.release_intelligence import (
    GitHubLookupError,
    TTLCache,
    _resolve_changelog,
    github_repository,
    select_releases,
)


class ReleaseResolutionTests(unittest.TestCase):
    def test_normalizes_github_repository_url_variants(self):
        cases = {
            "https://github.com/acme/widget": "acme/widget",
            "git+https://github.com/acme/widget.git": "acme/widget",
            "git://github.com/acme/widget.git": "acme/widget",
            "git@github.com:acme/widget.git": "acme/widget",
            "https://github.com/acme/widget/tree/main": "acme/widget",
            "https://github.com/acme/widget/releases": "acme/widget",
        }
        for value, expected in cases.items():
            with self.subTest(value=value):
                self.assertEqual(github_repository(value), expected)

    def test_selects_stable_releases_in_version_order(self):
        releases = [
            {"tag_name": "v1.3.0", "body": "minor"},
            {"tag_name": "v1.2.1", "body": "patch"},
            {"tag_name": "v1.3.0-rc1", "body": "rc"},
            {"tag_name": "v1.2.0", "body": "current"},
        ]

        selected, complete = select_releases(releases, "1.2.0", "1.3.0")

        self.assertTrue(complete)
        self.assertEqual([item["tag_name"] for item in selected], ["v1.2.1", "v1.3.0"])

    def test_selects_latest_patch_for_partial_target(self):
        releases = [
            {"tag_name": "1.4.1", "body": "older"},
            {"tag_name": "1.4.3", "body": "newest"},
            {"tag_name": "1.5.0", "body": "future"},
        ]

        selected, _ = select_releases(releases, "1.3", "1.4")

        self.assertEqual([item["tag_name"] for item in selected], ["1.4.1", "1.4.3"])

    def test_raw_github_fallback_populates_structured_fields(self):
        update = dependency_reporter.DependencyUpdate("node", "widget", "1.0.0", "", "1.1.0", "dependencies")
        release_info = dependency_reporter.ReleaseInfo(repository_url="https://github.com/acme/widget")
        cache = TTLCache()

        with patch(
            "dependency_reporter_lib.release_intelligence._github_releases",
            side_effect=GitHubLookupError("GitHub API rate limited", "rate_limited"),
        ), patch(
            "dependency_reporter_lib.release_intelligence.fetch_raw_text",
            return_value="# Widget 1.1.0\n\nFixed the widget.",
        ):
            _resolve_changelog(update, release_info, dependency_reporter.fetch_release_text, cache)

        self.assertEqual(release_info.source, "github_raw")
        self.assertEqual(release_info.source_status, "fallback")
        self.assertEqual(release_info.source_reason, "GitHub API rate limited")
        self.assertIn("Fixed the widget", release_info.release_notes_excerpt)

    def test_cache_expires_entries(self):
        cache = TTLCache(ttl=timedelta(seconds=-1))
        cache.put("key", "value")
        self.assertIsNone(cache.get("key"))


if __name__ == "__main__":
    unittest.main()
