export function buildAgentConfig(apiUrl: string, origin: string, profileId: number, token: string) {
  const url = new URL(apiUrl, origin);
  const parts = url.pathname.split('/').filter(Boolean);
  while (parts.length > 1 && parts.at(-1) === 'api' && parts.at(-2) === 'api') parts.pop();
  url.pathname = `/${parts.join('/')}`;
  url.search = ''; url.hash = '';
  return JSON.stringify({ serverUrl: url.toString().replace(/\/$/, ''), profileId, agentToken: token, statePath: 'agent-state.json' }, null, 2) + '\n';
}
