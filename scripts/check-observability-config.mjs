import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

// No Cloud credentials or network destinations. Uses the real Alloy pipeline.
const binary = process.env.ALLOY_BIN || 'alloy';
const source = fileURLToPath(new URL('../deploy/observability/', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'admin-alloy-check-'));
const execute = promisify(execFile);
try {
  await copyFile(join(source, 'config.alloy'), join(directory, 'config.alloy'));
  await execute(binary, ['validate', directory]);
  await copyFile(join(source, 'postgres.alloy.example'), join(directory, 'postgres.alloy'));
  await copyFile(join(source, 'postgres-logs.alloy.example'), join(directory, 'postgres-logs.alloy'));
  await execute(binary, ['validate', directory]);
  const config = await readFile(join(source, 'config.alloy'), 'utf8');
  const pipeline = config.slice(config.indexOf('loki.process "sanitized"'), config.indexOf('\nloki.write "cloud"'))
    .replace('[loki.write.cloud.receiver]', '[loki.echo.test.receiver]');
  assert.ok(pipeline.startsWith('loki.process'), 'Sanitizing pipeline missing');
  const fixture = join(directory, 'fixture.log');
  const now = Date.now();
  await writeFile(fixture, [
    JSON.stringify({ msg: 'obs-fixture-json user@example.com', level: 50, time: now, password: 'private-password', request: { headers: { cookie: 'private-cookie' }, body: 'private-body' } }),
    JSON.stringify({ msg: 'obs-fixture-caddy', level: 'info', ts: now / 1000, status: 200, request: { method: 'GET', uri: '/?token=private-query' } }),
    'obs-fixture-plain Bearer private-bearer password=private-plain user@example.com',
    '',
  ].join('\n'));
  const smoke = join(directory, 'smoke.config');
  await writeFile(smoke, `logging { level = "info" }
loki.echo "test" {}
loki.source.file "fixture" {
  targets = [{__path__ = ${JSON.stringify(fixture)}, service = "admin"}]
  forward_to = [loki.process.sanitized.receiver]
}
${pipeline}`);
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const address = socket.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  await new Promise((resolve, reject) => {
    const child = spawn(binary, ['run', '--server.http.listen-addr=127.0.0.1:' + port, '--storage.path=' + join(directory, 'state'), smoke], {
      env: { ...process.env, OBSERVABILITY_ENVIRONMENT: 'test', OBSERVABILITY_INSTANCE: 'fixture' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '', complete = false, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 15000);
    const collect = chunk => {
      output += chunk.toString();
      if (!complete && ['obs-fixture-json', 'obs-fixture-caddy', 'obs-fixture-plain'].every(value => output.includes(value))) {
        complete = true; child.kill('SIGINT');
      }
    };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', () => {
      clearTimeout(timer);
      try {
        assert.ok(!timedOut && complete, 'Alloy did not emit all fixture logs: ' + output.slice(-2000));
        assert.doesNotMatch(output, /private-password|private-cookie|private-body|private-query|private-bearer|private-plain|user@example\.com/);
        assert.match(output, /Filtered/);
        resolve();
      } catch (error) { reject(error); }
    });
  });
  console.log('Alloy base + Postgres configuration valid; real log pipeline redaction passed.');
} finally {
  await rm(directory, { recursive: true, force: true });
}
