"""backend_paths.py - Multi-folder backend path helper.

Adds core/ and modules/* subdirectories to sys.path so that apps can be imported
directly by their top-level package names (e.g. `import accounts`, `import warehouses`)
without changing package names or AppConfigs.
"""

from pathlib import Path
import sys

_BASE_DIR = Path(__file__).resolve().parent


def paths() -> list[str]:
    """Return list of paths for core/ and each subdirectory in modules/."""
    result: list[str] = []
    core_dir = _BASE_DIR / 'core'
    if core_dir.is_dir():
        result.append(str(core_dir))

    modules_dir = _BASE_DIR / 'modules'
    if modules_dir.is_dir():
        for item in sorted(modules_dir.iterdir()):
            if item.is_dir() and not item.name.startswith('.'):
                result.append(str(item))

    return result


def install() -> None:
    """Add paths() to sys.path if not already present."""
    base_str = str(_BASE_DIR)
    if base_str not in sys.path:
        sys.path.insert(0, base_str)

    for p in paths():
        if p not in sys.path:
            sys.path.insert(0, p)
