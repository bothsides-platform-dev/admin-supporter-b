import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const dev = process.argv.includes('--dev');
process.env.NODE_ENV ??= dev ? 'development' : 'production';
// Only this listener can request a session check. The route still verifies both
// login factors and the permission in the admin database on every request.
const sessionKey = randomBytes(32).toString('hex');
process.env.ADMIN_MARKETING_INTERNAL_TOKEN = sessionKey;
const { default: next } = await import('next');
const port = Number(process.env.PORT || 4242);
const server = createServer();
const devSockets = new Set();
if (dev) {
  server.on('connection', socket => {
    devSockets.add(socket);
    socket.once('close', () => devSockets.delete(socket));
  });
}
const admin = next({ dev, dir: fileURLToPath(new URL('.', import.meta.url)), port, httpServer: server });
await admin.prepare();
const handleAdmin = admin.getRequestHandler();

// Next has now loaded the admin environment. The marketing providers get only
// their own configuration and use the admin's public origin for callbacks.
const toolDir = process.env.MARKETING_TOOL_DIR;
let marketing;
if (toolDir) {
  try {
    const envFile = process.env.MARKETING_ENV_FILE;
    if (!isAbsolute(toolDir) || (envFile && !isAbsolute(envFile)))
      throw new Error('MARKETING_TOOL_DIR와 MARKETING_ENV_FILE에는 절대 경로가 필요합니다.');
    const { mountMarketing } = await import(pathToFileURL(join(toolDir, 'server/embedded.js')).href);
    marketing = mountMarketing({
      server,
      dataDir: process.env.MARKETING_DATA_DIR,
      origin: process.env.AUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:' + port,
      env: envFile ? parseEnv(await readFile(envFile, 'utf8')) : {},
      verifyAdmin: cookie => fetch('http://127.0.0.1:' + server.address().port + '/api/marketing/session', {
        headers: { cookie, 'x-admin-marketing-token': sessionKey },
        redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(5000),
      }),
    });
  } catch (error) {
    console.error('마케팅툴을 시작할 수 없습니다.', error.message);
  }
}

const marketingPaths = new Set([
  '/marketing', '/.well-known/oauth-authorization-server/marketing', '/.well-known/oauth-protected-resource/marketing/mcp',
]);
server.on('request', async (req, res) => {
  try {
    const path = req.url.split('?', 1)[0];
    if (toolDir && (path.startsWith('/marketing/') || marketingPaths.has(path))) {
      if (!marketing) {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end('마케팅툴을 시작하지 못했습니다. 관리자 서버 로그를 확인해 주세요.');
      }
      return await marketing.handleRequest(req, res);
    }
    await handleAdmin(req, res);
  } catch (error) {
    console.error('관리자 요청 처리 실패', error.code || error.name);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const requestsDone = new Promise(resolve => server.close(resolve));
  // An open development HMR WebSocket otherwise keeps server.close() pending.
  for (const socket of devSockets) socket.destroy();
  await Promise.all([requestsDone, marketing?.stopJobs()]);
  marketing?.close();
  await admin.close();
  process.exit(0);
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
server.listen(port, () => console.log('관리자 콘솔이 포트 %d에서 시작되었습니다.', server.address().port));
