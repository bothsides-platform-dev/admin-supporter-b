import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

module = Path(__file__).resolve().parents[1] / "auto_deploy.py"
spec = importlib.util.spec_from_file_location("admin_deploy", module)
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class ReleaseTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.base = Path(temp.name).resolve()
        self.root = self.base / "production"
        self.root.mkdir()
        (self.root / "shared").mkdir()
        (self.root / "shared/.env.production").write_text("AUTH_URL=https://admin.support-b.com\n")
        legacy = self.base / "old-admin"
        legacy.mkdir()
        (self.root / "legacy").symlink_to(legacy)
        self.origins = {}
        for kind in ("admin", "marketing"):
            repo = self.base / kind
            repo.mkdir()
            self.origins[kind] = repo.as_uri()
            self.git(kind, "init", "-q", "-b", "main")
            (repo / "server").mkdir()
            (repo / "package.json").write_text('{"type":"module"}')
            (repo / "server/embedded.js").write_text("export function mountMarketing() {}")
            (repo / "server.mjs").write_text("export {}")
            self.commit(kind, "initial")
        bin_dir = self.base / "bin"
        bin_dir.mkdir()
        pnpm = bin_dir / "pnpm"
        pnpm.write_text('#!/bin/sh\nif test "$1" = build; then mkdir -p .next/static .next/server; echo build >> "$TEST_BUILDS"; fi\n')
        pnpm.chmod(0o700)
        self.builds = self.base / "builds"
        for mock in [patch.dict(os.environ, PATH=str(bin_dir) + os.pathsep + os.environ["PATH"], TEST_BUILDS=str(self.builds)),
                     patch.object(deploy, "repositories", return_value=self.origins), patch.object(deploy, "admin_process", return_value=None)]:
            mock.start()
            self.addCleanup(mock.stop)
        self.starts = []
        self.fail_next = False
        mock = patch.object(deploy, "activate", side_effect=self.activate)
        mock.start()
        self.addCleanup(mock.stop)

    def git(self, kind, *args):
        return subprocess.check_output(["git", "-c", "user.email=ci@example.test", "-c", "user.name=CI",
                                        "-c", "commit.gpgsign=false", *args],
                                       cwd=self.base / kind, text=True).strip()

    def commit(self, kind, message):
        (self.base / kind / "revision").write_text(message)
        self.git(kind, "add", ".")
        self.git(kind, "commit", "-qm", message)
        return self.git(kind, "rev-parse", "HEAD")

    def promote(self, kind):
        self.git(kind, "update-ref", deploy.REF, "HEAD")

    def activate(self, root, pair):
        self.starts.append(pair)
        if pair:
            deploy.point(root / "current", pair)
        else:
            (root / "current").unlink(missing_ok=True)
        if self.fail_next:
            self.fail_next = False
            raise RuntimeError("health check failed")

    def initial(self):
        for kind in self.origins:
            self.promote(kind)
        deploy.deploy(self.root)
        return (self.root / "healthy").resolve(strict=True)

    def test_waits_for_both_ci_refs_and_reuses_admin_build_for_marketing(self):
        self.promote("marketing")
        deploy.deploy(self.root)
        self.assertEqual(self.starts, [])
        old = self.initial()
        self.commit("marketing", "untested")
        deploy.deploy(self.root)
        self.assertEqual(self.starts, [old])
        self.promote("marketing")
        deploy.deploy(self.root)
        new = (self.root / "current").resolve(strict=True)
        self.assertEqual(self.starts, [old, new])
        self.assertNotEqual(old, new)
        self.assertEqual((new / "admin").resolve(), (old / "admin").resolve())
        self.assertEqual((new / "admin/.env.production").resolve(), self.root / "shared/.env.production")
        self.assertEqual(self.builds.read_text().splitlines(), ["build"])
        self.assertEqual((self.root / "previous").resolve(), old)

    def test_failure_restores_previous_release_and_explicit_retry_recovers(self):
        old = self.initial()
        (self.root / "shared/keep").write_text("persistent")
        self.commit("admin", "update")
        self.promote("admin")
        self.fail_next = True
        with self.assertRaisesRegex(RuntimeError, "health check"):
            deploy.deploy(self.root)
        self.assertEqual((self.root / "current").resolve(), old)
        self.assertEqual((self.root / "healthy").resolve(), old)
        count = len(self.starts)
        deploy.deploy(self.root)
        self.assertEqual(len(self.starts), count)
        deploy.deploy(self.root, retry=True)
        self.assertNotEqual((self.root / "healthy").resolve(), old)
        self.assertEqual((self.root / "shared/keep").read_text(), "persistent")

    def test_installer_preserves_cron_and_limits_incoming_refs(self):
        legacy = (self.root / "legacy").resolve()
        (legacy / "ecosystem.config.cjs").touch()
        (legacy / ".env.production").write_text("MARKETING_DATA_DIR=/existing/data\n")
        home = self.base / "account"
        home.mkdir()
        cron = self.base / "crontab"
        cron.write_text("0 1 * * * existing-job\n")
        key = self.base / "ci.pub"
        key.write_text("ssh-ed25519 Zml4dHVyZQ== local-test\n")
        for name, script in {
            "crontab": 'if [ "$1" = -l ]; then cat "$TEST_CRON"; else cp "$1" "$TEST_CRON"; fi',
            "pm2": 'printf \'[{"name":"admin-supporter-b","pm2_env":{"status":"online","pm_cwd":"%s"}}]\\n\' "$TEST_LEGACY"',
        }.items():
            stub = self.base / "bin" / name
            stub.write_text("#!/bin/sh\n" + script + "\n")
            stub.chmod(0o700)
        env = {**os.environ, "HOME": str(home), "TEST_CRON": str(cron), "TEST_LEGACY": str(legacy)}
        for _ in range(2):
            subprocess.run(["bash", module.with_name("install-auto-deploy.sh"), key], check=True, env=env, stdout=subprocess.DEVNULL)
        actual = home / "admin-production"
        self.assertEqual(cron.read_text().count("admin-supporter-b:auto-deploy"), 1)
        self.assertIn("existing-job", cron.read_text())
        self.assertEqual((actual / "shared/.env.production").read_text(), "MARKETING_DATA_DIR=/existing/data\n")
        self.assertNotIn("MARKETING_DATA_DIR", (actual / "shared/.env.production.local").read_text())
        self.assertEqual((home / ".ssh/authorized_keys").read_text().count('restrict,command='), 1)
        inbox = str(actual / "incoming/marketing.git")
        self.git("marketing", "push", "--quiet", inbox, "HEAD:" + deploy.REF)
        denied = subprocess.run(["git", "push", inbox, "HEAD:refs/heads/main"], cwd=self.base / "marketing", capture_output=True)
        self.assertNotEqual(denied.returncode, 0)
        self.assertEqual(subprocess.check_output(["git", "-C", inbox, "for-each-ref", "--format=%(refname)"], text=True).strip(), deploy.REF)

    def test_failed_first_activation_restores_legacy(self):
        self.fail_next = True
        with self.assertRaisesRegex(RuntimeError, "health check"):
            self.initial()
        self.assertIsNone(self.starts[-1])
        self.assertFalse((self.root / "current").is_symlink())
        self.assertTrue((self.root / "legacy").is_dir())

    def test_interrupted_switch_recovers_before_contacting_git(self):
        old = self.initial()
        (self.root / "activating").touch()
        with patch.object(deploy, "approved_revision", side_effect=ConnectionError):
            with self.assertRaises(ConnectionError):
                deploy.deploy(self.root)
        self.assertEqual(self.starts, [old, old])
        self.assertFalse((self.root / "activating").exists())

    def test_does_not_switch_if_a_new_revision_was_promoted_while_building(self):
        for kind in self.origins:
            self.promote(kind)
        heads = [self.git(k, "rev-parse", "HEAD") for k in self.origins]
        with patch.object(deploy, "approved_revision", side_effect=[*heads, "a" * 40]):
            deploy.deploy(self.root)
        self.assertEqual(self.starts, [])
