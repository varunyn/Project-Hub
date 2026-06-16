import unittest

import dependency_reporter


class ModuleBoundaryTests(unittest.TestCase):
    def test_public_facade_reexports_split_modules(self):
        from dependency_reporter_lib import checks, config, discovery, models, reports, release_intelligence

        self.assertIs(dependency_reporter.Project, models.Project)
        self.assertIs(dependency_reporter.load_config, config.load_config)
        self.assertIs(dependency_reporter.discover_projects, discovery.discover_projects)
        self.assertIs(dependency_reporter.check_project, checks.check_project)
        self.assertIs(dependency_reporter.write_reports, reports.write_reports)
        self.assertIs(
            dependency_reporter.enrich_results_with_release_intelligence,
            release_intelligence.enrich_results_with_release_intelligence,
        )


if __name__ == "__main__":
    unittest.main()
