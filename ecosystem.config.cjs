// pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'alkaline',
      script: 'server/index.js',
      cwd: __dirname,
      node_args: '--disable-warning=ExperimentalWarning', // node:sqlite is still flagged experimental
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '300M',
      time: true,
      kill_timeout: 5000,
    },
  ],
};
