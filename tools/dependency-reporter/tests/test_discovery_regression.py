import tempfile
import unittest
from pathlib import Path

import dependency_reporter


class DiscoveryRegressionTests(unittest.TestCase):
    def test_skips_eve_snapshots_but_discovers_legitimate_hidden_projects(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest = '{"dependencies":{"react":"18.2.0"}}'
            (root / "package.json").write_text(manifest)
            for index in range(6):
                snapshot = root / ".eve" / "dev-runtime" / "snapshots" / str(index) / "source"
                snapshot.mkdir(parents=True)
                (snapshot / "package.json").write_text(manifest)

            hidden_project = root / ".workspace-tools"
            hidden_project.mkdir()
            (hidden_project / "package.json").write_text('{"dependencies":{"vite":"5.0.0"}}')

            projects = dependency_reporter.discover_projects([root], ignore_dirs=set())

        self.assertEqual(
            {project.path for project in projects},
            {root, hidden_project},
        )


if __name__ == "__main__":
    unittest.main()
