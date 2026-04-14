const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..', '..');
const logsDir = path.join(projectRoot, 'docs', 'e2e');
const runtimeEnvFile = process.env.PICTRONIC_RUNTIME_ENV_FILE || path.join(projectRoot, '.env.runtime');
const watchdogPollIntervalSeconds = Number(process.env.PICTRONIC_WATCHDOG_POLL_INTERVAL_SECONDS || '10');
const runtimeErrorLog = process.env.PICTRONIC_RUNTIME_ERROR_LOG_PATH || path.join(logsDir, 'pictronic-runtime.pm2.err.log');
const connectorErrorLog = process.env.PICTRONIC_CONNECTOR_ERROR_LOG_PATH || path.join(logsDir, 'pictronic-connector.pm2.err.log');
const watchdogStatePath = process.env.PICTRONIC_WATCHDOG_STATE_PATH || path.join(logsDir, 'pictronic-watchdog.state.json');
const watchdogRecoveryLogPath = process.env.PICTRONIC_WATCHDOG_LOG_PATH || path.join(logsDir, 'pictronic-watchdog-recovery.log');

function loadRuntimeEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const parsed = {};
  const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) {
      continue;
    }
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key) {
      parsed[key] = value;
    }
  }
  return parsed;
}

const runtimeEnv = loadRuntimeEnv(runtimeEnvFile);

module.exports = {
  apps: [
    {
      name: 'pictronic-runtime',
      cwd: projectRoot,
      script: '/bin/bash',
      args: '-lc "./ops/runtime/start-runtime.sh"',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 50,
      min_uptime: 3000,
      restart_delay: 2000,
      out_file: path.join(logsDir, 'pictronic-runtime.pm2.log'),
      error_file: runtimeErrorLog,
      merge_logs: true,
      time: true,
      env: {
        ...runtimeEnv,
        PICTRONIC_PROJECT_ROOT: projectRoot,
        PICTRONIC_WATCHDOG_STATE_PATH: watchdogStatePath,
        PICTRONIC_WATCHDOG_LOG_PATH: watchdogRecoveryLogPath,
        PICTRONIC_WATCHDOG_POLL_INTERVAL_SECONDS: String(watchdogPollIntervalSeconds),
        PICTRONIC_RUNTIME_PORT: '3000',
        PICTRONIC_RUNTIME_HOST: '127.0.0.1',
        NODE_ENV: 'development',
      },
    },
    {
      name: 'bridge-connector',
      cwd: projectRoot,
      script: 'python3',
      args: `bridge_connector.py --env-file ${runtimeEnvFile}`,
      interpreter: 'none',
      autorestart: true,
      max_restarts: 50,
      min_uptime: 3000,
      restart_delay: 2000,
      out_file: path.join(logsDir, 'pictronic-connector.pm2.log'),
      error_file: connectorErrorLog,
      merge_logs: true,
      time: true,
      env: {
        ...runtimeEnv,
        PICTRONIC_PROJECT_ROOT: projectRoot,
      },
    },
    {
      name: 'bridge-watchdog',
      cwd: projectRoot,
      script: 'python3',
      args: `ops/runtime/watchdog.py --manager pm2 --pm2-command "npx --yes pm2" --env-file ${runtimeEnvFile} --runtime-error-log ${runtimeErrorLog} --connector-error-log ${connectorErrorLog} --poll-interval-seconds ${watchdogPollIntervalSeconds} --recovery-log ${watchdogRecoveryLogPath} --state-file ${watchdogStatePath}`,
      interpreter: 'none',
      autorestart: true,
      max_restarts: 50,
      min_uptime: 3000,
      restart_delay: 2000,
      out_file: path.join(logsDir, 'pictronic-watchdog.pm2.log'),
      error_file: path.join(logsDir, 'pictronic-watchdog.pm2.err.log'),
      merge_logs: true,
      time: true,
      env: {
        ...runtimeEnv,
        PICTRONIC_PROJECT_ROOT: projectRoot,
        PICTRONIC_WATCHDOG_STATE_PATH: watchdogStatePath,
        PICTRONIC_WATCHDOG_LOG_PATH: watchdogRecoveryLogPath,
        PICTRONIC_WATCHDOG_POLL_INTERVAL_SECONDS: String(watchdogPollIntervalSeconds),
      },
    },
  ],
};
