from __future__ import annotations

import subprocess
from pathlib import Path

from .models import CommandResult


COMMAND_TIMEOUT_SECONDS = 120


def run_command(command: list[str], cwd: Path) -> CommandResult:
    try:
        completed = subprocess.run(
            command,
            cwd=cwd,
            text=True,
            capture_output=True,
            check=False,
            timeout=COMMAND_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as exc:
        return CommandResult(124, "", f"Command timeout after {exc.timeout} seconds: {exc.cmd}")
    except OSError as exc:
        return CommandResult(127, "", str(exc))
    return CommandResult(completed.returncode, completed.stdout, completed.stderr)


def _command_output_snippet(command_result: CommandResult, limit: int = 300) -> str:
    stdout = command_result.stdout.strip()
    stderr = command_result.stderr.strip()
    parts: list[str] = []
    if stdout:
        parts.append(f"stdout: {stdout[:limit]}")
    if stderr:
        parts.append(f"stderr: {stderr[:limit]}")
    return "; ".join(parts) if parts else "no stdout or stderr"
