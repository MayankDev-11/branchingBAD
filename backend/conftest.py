# Lets `python -m pytest` run from inside backend/ as well as from the repo root.
# Because backend/ is a package, pytest puts its parent (the repo root) on
# sys.path when it loads this file, so `from backend.main import app` resolves.
