import { isSea } from 'node:sea';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

export function agentDirectory(executable = process.execPath, entry = process.argv[1], packaged = isSea()) {
  return dirname(packaged ? executable : resolve(entry ?? 'agent.mjs'));
}

export function agentPaths(configArgument = process.argv.slice(2).find((arg) => !arg.startsWith('--')), options = {}) {
  const base = agentDirectory(options.executable, options.entry, options.packaged);
  const configPath = configArgument ? resolve(configArgument) : join(base, 'agent-config.json');
  const configDir = dirname(configPath);
  const relativeToConfig = (value, fallback) => {
    const path = value || fallback;
    return isAbsolute(path) ? path : resolve(configDir, path);
  };
  return {
    configPath,
    dataPath: (path) => relativeToConfig(path, '.'),
    statePath: (config) => relativeToConfig(config.statePath, `${basename(configPath)}.state.json`),
    logPath: (config) => relativeToConfig(config.logPath, 'agent.log'),
    windowsPrintScript: join(base, 'windows-raw-print.ps1'),
  };
}
