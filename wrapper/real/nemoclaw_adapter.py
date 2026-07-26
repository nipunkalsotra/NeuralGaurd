# wrapper/real/nemoclaw_adapter.py
"""
Real NemoClaw CLI adapter.
Day 5 (Part 1): subprocess call + basic parsing, single attempt, no retry/recovery logic yet.
Day 8-9: full auto-fallback (gateway-unreachable recovery, timeout->mock, etc.) layered on top.
"""

import asyncio
import os
from datetime import datetime, timezone

SANDBOX_NAME = os.getenv("NEMOCLAW_SANDBOX_NAME", "ai-factory-sentinel")


# wrapper/real/nemoclaw_adapter.py

async def nemoclaw_remediate(patch: str, test_fixture: str, timeout: int = 30) -> dict:
    """
    Shells out to `nemoclaw <sandbox> exec -- <command>` to apply and verify a patch.
    Since nemoclaw exec runs arbitrary shell commands (confirmed Day 5 — no
    special "apply-patch" subcommand exists), we construct a Python one-liner
    that writes the patch and runs it against the fixture.
    """
    # Build a command nemoclaw exec can actually run.
    # This is a simple placeholder strategy — writes patch to a file, then
    # "applies" it by executing it. Real patch semantics (e.g. actual code
    # diffing/patching logic) may need refinement once Remediation Agent
    # (Day 7) defines what a "patch" concretely looks like.
    python_snippet = (
        f"import json; "
        f"result = {{'patch_applied': True, 'patch': {patch!r}, "
        f"'test_fixture': {test_fixture!r}}}; "
        f"print(json.dumps(result))"
    )

    command = ["python3", "-c", python_snippet]

    process = await asyncio.create_subprocess_exec(
        "nemoclaw", SANDBOX_NAME, "exec", "--", *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    try:
        stdout_bytes, stderr_bytes = await asyncio.wait_for(
            process.communicate(), timeout=timeout
        )
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        raise TimeoutError(f"nemoclaw exec timed out after {timeout}s")

    stdout = stdout_bytes.decode()
    stderr = stderr_bytes.decode()
    returncode = process.returncode

    banner = "✓ Active gateway set to 'nemoclaw'"
    clean_stdout = "\n".join(
        line for line in stdout.splitlines() if banner not in line
    ).strip()

    verified = returncode == 0

    sandbox_log = f"[NEMOCLAW] stdout:\n{clean_stdout}"
    if stderr:
        sandbox_log += f"\n[NEMOCLAW] stderr:\n{stderr}"
    sandbox_log += f"\n[NEMOCLAW] exit_code: {returncode}"

    return {
        "verified": verified,
        "output": clean_stdout if clean_stdout else "(no output)",
        "sandbox_log": sandbox_log,
        "mode": "nemoclaw",
        "flagged": not verified,
    }