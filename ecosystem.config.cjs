module.exports = {
  apps: [
    {
      name: 'admin-supporter-b',
      cwd: __dirname,
      script: './node_modules/next/dist/bin/next',
      args: 'start -p 4242',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production', PORT: '4242' },
    },
  ],
};
