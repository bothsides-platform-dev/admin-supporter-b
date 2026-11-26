module.exports = {
  apps: [
    {
      name: 'admin-supporter-b',
      cwd: __dirname,
      script: './server.mjs',
      instances: 1,
      exec_mode: 'fork',
      kill_timeout: 15000,
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production', PORT: '4242' },
    },
  ],
};
