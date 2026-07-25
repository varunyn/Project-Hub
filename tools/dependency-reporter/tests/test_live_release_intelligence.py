import os
import unittest

from dependency_reporter_lib.release_intelligence import (
    TTLCache,
    _github_releases,
    _is_prerelease,
    _parse_version,
    select_releases,
)


@unittest.skipUnless(
    os.environ.get("RUN_LIVE_CHANGELOG_TESTS") == "1",
    "set RUN_LIVE_CHANGELOG_TESTS=1 to enable public GitHub API smoke tests",
)
class LiveReleaseIntelligenceTests(unittest.TestCase):
    def test_fetches_and_matches_real_dockbrr_releases(self):
        releases = _github_releases("yorah/dockbrr", TTLCache())
        stable_tags = [
            str(release.get("tag_name", ""))
            for release in releases
            if release.get("tag_name")
            and _parse_version(str(release.get("tag_name", "")))
            and not _is_prerelease(str(release.get("tag_name", "")))
        ]
        stable_tags.sort(key=lambda tag: _parse_version(tag) or (0, 0, 0), reverse=True)

        self.assertTrue(releases, "GitHub returned no releases for yorah/dockbrr")
        self.assertTrue(stable_tags, "GitHub returned no usable release tags for yorah/dockbrr")

        target = stable_tags[0]
        selected, complete = select_releases(releases, "0.0.0", target)

        self.assertTrue(selected)
        self.assertTrue(complete)
        self.assertEqual(selected[-1]["tag_name"], target)


if __name__ == "__main__":
    unittest.main()
