// PM2 ecosystem config for Takseer
// Usage: pm2 start ecosystem.config.cjs

module.exports = {
  apps: [
    {
      name: 'takseer',
      script: 'server/server.js',
      cwd: '/opt/takseer',              // Adjust if your project path differs
      instances: 1,                     // Single instance (Chromium pool is singleton)
      exec_mode: 'fork',
      watch: false,                     // Set true for dev only
      max_memory_restart: '1536M',      // 1.5 GB — PM2 hanya terima integer + satuan
      env: {
        NODE_ENV: 'production',
        PORT: 8787,
        HOST: '127.0.0.1',
      },
      // Logging
      error_file: '/var/log/takseer/error.log',
      out_file: '/var/log/takseer/out.log',
      log_file: '/var/log/takseer/combined.log',
      time: true,                       // Prefix logs with timestamp
      // Restart policy
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      // Graceful shutdown
      kill_timeout: 5000,               // Wait 5s for browserPool.shutdown()
      listen_timeout: 10000,            // Wait 10s for server to start listening
    },
  ],
};