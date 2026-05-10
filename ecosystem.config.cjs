module.exports = {
  apps: [
    {
      name: "api",
      cwd: __dirname,
      script: "./apps/api/dist/index.js",
      interpreter: process.execPath,
      node_args: "--env-file=.env",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "300M",
    },
  ],
};
