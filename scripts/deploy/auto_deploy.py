"""Promote the two CI-tested revisions together on the existing admin listener."""
import argparse
import fcntl
import http.client
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time

APP = "admin-supporter-b"
PUBLIC_HOST = "admin.support-b.com"
REF = "refs/heads/deploy/production"
ENV_FILES = (".env", ".env.local", ".env.production", ".env.production.local")
SHA = re.compile(r"[0-9a-f]{40}")


def output(*args, **kwargs):
    return subprocess.check_output(args, text=True, **kwargs).strip()


def run(*args, **kwargs):
    subprocess.run(args, check=True, **kwargs)


def repositories(root):
    return {"admin": "https://github.com/bothsides-platform-dev/admin-supporter-b.git",
            "marketing": (root / "incoming/marketing.git").as_uri()}


def point(link, destination):
    """Replace a symlink without an interval in which it doesn't exist."""
    temporary = link.with_name(link.name + ".new")
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(destination)
    temporary.replace(link)


def approved_revision(url, env):
    result = subprocess.run(["git", "ls-remote", "--exit-code", url, REF], env=env, text=True,
                            stdout=subprocess.PIPE, timeout=45)
    if result.returncode == 2:
        return None  # This repository has not promoted its first main commit yet.
    result.check_returncode()
    sha, ref = result.stdout.strip().split()
    if not SHA.fullmatch(sha) or ref != REF:
        raise ValueError("Invalid production ref")
    return sha


def prepare(root, kind, sha, url, env):
    parent = root / "releases" / kind
    parent.mkdir(parents=True, exist_ok=True)
    release = parent / sha
    if release.is_dir():
        return release
    stage = Path(tempfile.mkdtemp(prefix=".prepare-", dir=parent))
    try:
        run("git", "init", "--quiet", cwd=stage)
        run("git", "fetch", "--quiet", "--depth=1", "--no-tags", url, REF, cwd=stage, env=env, timeout=240)
        if output("git", "rev-parse", "FETCH_HEAD", cwd=stage) != sha:
            raise RuntimeError("CI promoted a newer revision during preparation; retrying on the next check")
        run("git", "checkout", "--quiet", "--detach", sha, cwd=stage)
        shutil.rmtree(stage / ".git")
        if kind == "marketing":
            run("pnpm", "install", "--prod", "--frozen-lockfile", cwd=stage)
            run("node", "--input-type=module", "-e",
                'import { mountMarketing } from "./server/embedded.js"; if (typeof mountMarketing !== "function") process.exit(1)', cwd=stage)
        else:
            run("pnpm", "install", "--frozen-lockfile", cwd=stage)
            for name in ENV_FILES:
                config = root / "shared" / name
                if config.is_file():
                    (stage / name).symlink_to(config)
            run("node", "--check", "server.mjs", cwd=stage)
            run("pnpm", "build", cwd=stage, env={**os.environ, "NODE_OPTIONS": "--max-old-space-size=1024",
                                                 "NEXT_TELEMETRY_DISABLED": "1"})
            for retired in ("supporter-b.store", "supporter-b.com"):
                scan = subprocess.run(["grep", "-rlF", retired, ".next/static", ".next/server"], cwd=stage, stdout=subprocess.DEVNULL)
                if scan.returncode != 1:
                    raise RuntimeError("Production build contains a retired domain or could not be checked")
        stage.rename(release)
        return release
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def admin_process():
    apps = [p for p in json.loads(output("pm2", "jlist")) if p["name"] == APP]
    if len(apps) > 1:
        raise RuntimeError("Expected a single admin process")
    return apps[0]["pm2_env"] if apps else None


def http_ready(marketing):
    conn = http.client.HTTPConnection("127.0.0.1", 4242, timeout=3)
    # Connect to the local listener with the same Host that Caddy forwards.
    headers = {"Host": PUBLIC_HOST}
    try:
        conn.request("GET", "/login", headers=headers)
        login = conn.getresponse()
        login.read()
        if login.status != 200:
            return False
        if marketing:
            conn.request("GET", "/.well-known/oauth-protected-resource/marketing/mcp", headers=headers)
            meta = conn.getresponse()
            return meta.status == 200 and json.load(meta).get("resource") == f"https://{PUBLIC_HOST}/marketing/mcp"
        return True
    except (OSError, ValueError, http.client.HTTPException):
        return False
    finally:
        conn.close()


def activate(root, pair):
    app = admin_process()
    if app:
        run("pm2", "delete", APP)
    for _ in range(80):
        try:
            with socket.create_connection(("127.0.0.1", 4242), timeout=1):
                pass
        except ConnectionRefusedError:
            break
        time.sleep(0.25)
    else:
        raise RuntimeError("The previous listener still holds port 4242")
    if pair:
        point(root / "current", pair)
        directory = (pair / "admin").resolve(strict=True)
    else:
        (root / "current").unlink(missing_ok=True)
        directory = (root / "legacy").resolve(strict=True)
    run("pm2", "start", str(directory / "ecosystem.config.cjs"), "--only", APP)
    for _ in range(30):
        if http_ready(bool(pair)):
            app = admin_process()
            if app and app["status"] == "online" and Path(app["pm_cwd"]).resolve() == directory:
                run("pm2", "save")
                return
        time.sleep(1)
    raise RuntimeError("Admin release did not become healthy on port 4242")


def prune(root, keep):
    for kind in repositories(root):
        retained = {(pair / kind).resolve() for pair in keep}
        for release in (root / "releases" / kind).iterdir():
            if SHA.fullmatch(release.name) and release not in retained:
                shutil.rmtree(release)
    for pair in (root / "pairs").iterdir():
        if re.fullmatch(r"[0-9a-f]{40}-[0-9a-f]{40}", pair.name) and pair not in keep:
            shutil.rmtree(pair)


def deploy(root, retry=False):
    good_link = root / "healthy"
    good = good_link.resolve(strict=True) if good_link.is_symlink() else None
    pending = root / "activating"
    if pending.exists():
        # A host reboot can interrupt the short interval between stop and save.
        activate(root, good)
        pending.unlink()
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    origins = repositories(root)
    revisions = {kind: approved_revision(url, env) for kind, url in origins.items()}
    if not all(revisions.values()):
        return
    pair = root / "pairs" / (revisions["admin"] + "-" + revisions["marketing"])
    failed = root / "failed"
    if pair == good or (not retry and failed.is_file() and failed.read_text().strip() == pair.name):
        return
    for kind, sha in revisions.items():
        release = prepare(root, kind, sha, origins[kind], env)
        pair.mkdir(parents=True, exist_ok=True)
        point(pair / kind, release)
    # Both tested heads must still match after the possibly long Next build.
    if any(approved_revision(url, env) != revisions[kind] for kind, url in origins.items()):
        return
    expected = ((good / "admin") if good else (root / "legacy")).resolve(strict=True)
    app = admin_process()
    if app and Path(app["pm_cwd"]).resolve() != expected:
        raise RuntimeError("The live admin release changed outside auto-deploy. Check its path before switching.")
    print("Activating admin and marketing", pair.name, flush=True)
    pending.touch()
    try:
        activate(root, pair)
    except Exception:
        failed.write_text(pair.name + "\n")
        activate(root, good)
        pending.unlink()
        raise
    if good:
        point(root / "previous", good)
    point(good_link, pair)
    pending.unlink()
    failed.unlink(missing_ok=True)
    prune(root, {pair, good} - {None})
    print("Healthy on port 4242:", pair.name, flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--retry", action="store_true", help="Retry a pair that previously failed the live health check")
    args = parser.parse_args()
    # PM2 snapshots its caller's environment. Both cron and a manual retry must
    # let Next read its actual runtime settings from the shared files at boot.
    for name in list(os.environ):
        if name not in {"HOME", "USER", "LOGNAME", "PATH", "LANG", "LC_ALL", "TMPDIR", "SHELL", "PM2_HOME"}:
            del os.environ[name]
    os.environ["CI"] = "1"
    root = Path.home() / "admin-production"
    # The initially installed controller hands off to the last healthy admin release.
    controller = root / "healthy/admin/scripts/deploy/auto_deploy.py"
    if Path(__file__).resolve() == root / "bootstrap.py" and controller.is_file():
        os.execv(sys.executable, [sys.executable, str(controller), *sys.argv[1:]])
    os.umask(0o077)
    with (root / "deploy.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        deploy(root, args.retry)


if __name__ == "__main__":
    main()
