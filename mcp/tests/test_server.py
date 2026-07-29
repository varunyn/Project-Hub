import importlib
import json
import tempfile
import unittest
from pathlib import Path


class DependencyReportToolsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.tmpdir.name)
        self.projects_file = self.data_dir / "projects.json"
        self.tasks_file = self.data_dir / "tasks.json"
        self.reports_dir = self.data_dir / "dependency-reports"
        self.reports_dir.mkdir()

        self.projects_file.write_text(
            json.dumps(
                [
                    {
                        "id": "alpha",
                        "name": "Alpha",
                        "path": "/workspace/alpha",
                        "techStack": ["Python"],
                        "status": "in progress",
                    },
                    {
                        "id": "beta",
                        "name": "Beta",
                        "path": "/workspace/beta",
                        "techStack": ["Node"],
                        "status": "completed",
                    },
                ]
            ),
            encoding="utf-8",
        )
        self.tasks_file.write_text(
            json.dumps(
                [
                    {
                        "id": "task-alpha-1",
                        "projectId": "alpha",
                        "title": "Ship API",
                        "description": "Finish the task API",
                        "status": "todo",
                        "priority": "high",
                        "assigneeId": "you",
                        "labels": ["api"],
                        "dueDate": "",
                        "position": 0,
                        "createdAt": "2026-06-01T00:00:00Z",
                        "updatedAt": "2026-06-02T00:00:00Z",
                    },
                    {
                        "id": "task-alpha-2",
                        "projectId": "alpha",
                        "title": "Write docs",
                        "description": "Document the workflow",
                        "status": "done",
                        "priority": "low",
                        "assigneeId": "",
                        "labels": ["docs"],
                        "dueDate": "",
                        "position": 0,
                        "createdAt": "2026-06-01T00:00:00Z",
                        "updatedAt": "2026-06-03T00:00:00Z",
                    },
                    {
                        "id": "task-beta-1",
                        "projectId": "beta",
                        "title": "Review release",
                        "description": "Review the next release",
                        "status": "review",
                        "priority": "medium",
                        "assigneeId": "you",
                        "labels": ["release"],
                        "dueDate": "",
                        "position": 0,
                        "createdAt": "2026-06-01T00:00:00Z",
                        "updatedAt": "2026-06-04T00:00:00Z",
                    },
                ]
            ),
            encoding="utf-8",
        )
        (self.reports_dir / "dependency-report-2026-06-15.json").write_text(
            json.dumps(
                {
                    "generated_at": "2026-06-15",
                    "scan_roots": ["/workspace"],
                    "projects": [
                        {
                            "path": "/workspace/alpha",
                            "ecosystems": ["python"],
                            "manifests": ["pyproject.toml"],
                            "warnings": ["old lockfile"],
                            "errors": [],
                            "updates": [
                                {
                                    "ecosystem": "python",
                                    "package": "fastapi",
                                    "current": "0.100.0",
                                    "wanted": "",
                                    "latest": "0.111.0",
                                    "dependency_type": "uv.lock",
                                    "release_info": {
                                        "latest_release_date": "2026-06-10T00:00:00Z",
                                        "ai_risk": "medium",
                                        "ai_breaking_changes": ["Review lifespan changes"],
                                    },
                                }
                            ],
                        },
                        {
                            "path": "/workspace/beta",
                            "ecosystems": ["node"],
                            "manifests": ["package.json"],
                            "warnings": [],
                            "errors": ["npm unavailable"],
                            "updates": [],
                        },
                    ],
                }
            ),
            encoding="utf-8",
        )

        self.server = importlib.import_module("server")
        self.original_projects_file = self.server.PROJECTS_FILE
        self.original_tasks_file = self.server.TASKS_FILE
        self.original_reports_dir = getattr(self.server, "DEPENDENCY_REPORTS_DIR", None)
        self.server.PROJECTS_FILE = self.projects_file
        self.server.TASKS_FILE = self.tasks_file
        self.server.DEPENDENCY_REPORTS_DIR = self.reports_dir

    def tearDown(self) -> None:
        self.server.PROJECTS_FILE = self.original_projects_file
        self.server.TASKS_FILE = self.original_tasks_file
        if self.original_reports_dir is not None:
            self.server.DEPENDENCY_REPORTS_DIR = self.original_reports_dir
        self.tmpdir.cleanup()

    def test_get_dependency_report_returns_latest_report_with_totals(self) -> None:
        report = self.server.get_dependency_report()

        self.assertEqual(report["status"], "ready")
        self.assertEqual(report["generated_at"], "2026-06-15")
        self.assertEqual(report["report_file_name"], "dependency-report-2026-06-15.json")
        self.assertEqual(report["totals"], {"projects": 2, "updates": 1, "warnings": 1, "errors": 1})
        self.assertEqual(report["projects"][0]["updates"][0]["package"], "fastapi")

    def test_get_project_dependency_updates_matches_project_id_to_report_path(self) -> None:
        result = self.server.get_project_dependency_updates("alpha")

        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["project"]["name"], "Alpha")
        self.assertEqual(result["dependency_project"]["path"], "/workspace/alpha")
        self.assertEqual(result["updates"][0]["package"], "fastapi")

    def test_search_dependency_updates_filters_by_package_and_risk(self) -> None:
        result = self.server.search_dependency_updates(package="fast", risk="medium")

        self.assertEqual(result["status"], "ready")
        self.assertEqual(len(result["updates"]), 1)
        self.assertEqual(result["updates"][0]["project_path"], "/workspace/alpha")
        self.assertEqual(result["updates"][0]["package"], "fastapi")

    def test_get_dependency_report_returns_missing_when_no_report_exists(self) -> None:
        for path in self.reports_dir.glob("*.json"):
            path.unlink()

        report = self.server.get_dependency_report()

        self.assertEqual(report["status"], "missing")
        self.assertEqual(report["projects"], [])
        self.assertEqual(report["totals"], {"projects": 0, "updates": 0, "warnings": 0, "errors": 0})

    def test_project_resources_expose_read_only_snapshots(self) -> None:
        self.assertEqual(len(self.server.projects_resource()), 2)

        report = self.server.dependency_report_resource()
        self.assertEqual(report["status"], "ready")
        self.assertEqual(report["totals"]["updates"], 1)

        project_updates = self.server.project_dependency_updates_resource("alpha")
        self.assertEqual(project_updates["status"], "ready")
        self.assertEqual(project_updates["updates"][0]["package"], "fastapi")

    def test_prompt_guides_dependency_update_review(self) -> None:
        prompt = self.server.review_dependency_update_prompt("fastapi", "alpha")

        self.assertIn("fastapi", prompt)
        self.assertIn("alpha", prompt)
        self.assertIn("get_project_dependency_updates", prompt)
        self.assertIn("breaking changes", prompt)

    def test_list_tasks_supports_project_status_priority_and_query_filters(self) -> None:
        self.assertEqual([task["id"] for task in self.server.list_tasks()], ["task-alpha-1", "task-beta-1", "task-alpha-2"])
        self.assertEqual([task["id"] for task in self.server.list_tasks(project_id="alpha")], ["task-alpha-1", "task-alpha-2"])
        self.assertEqual([task["id"] for task in self.server.list_tasks(status="review", priority="medium")], ["task-beta-1"])
        self.assertEqual([task["id"] for task in self.server.list_tasks(query="workflow")], ["task-alpha-2"])

    def test_task_lookup_and_resources_are_project_aware(self) -> None:
        self.assertEqual(self.server.get_task("task-alpha-1")["projectId"], "alpha")
        self.assertIsNone(self.server.get_task("missing"))
        self.assertEqual(len(self.server.tasks_resource()), 3)
        self.assertEqual(self.server.project_tasks_resource("alpha")[0]["projectId"], "alpha")

    def test_task_crud_and_status_movement_persist_through_public_tools(self) -> None:
        created = self.server.create_task("alpha", "New task", priority="high")
        self.assertEqual(created["status"], "todo")
        self.assertEqual(self.server.get_task(created["id"])["title"], "New task")

        updated = self.server.update_task(created["id"], status="review", position=0)
        self.assertEqual(updated["status"], "review")
        self.assertEqual(self.server.get_task(created["id"])["position"], 0)
        self.assertTrue(self.server.delete_task(created["id"]))
        self.assertIsNone(self.server.get_task(created["id"]))

    def test_task_updates_cannot_cross_project_scope(self) -> None:
        self.assertIsNone(self.server.update_task("task-alpha-1", project_id="beta", title="Nope"))


if __name__ == "__main__":
    unittest.main()
