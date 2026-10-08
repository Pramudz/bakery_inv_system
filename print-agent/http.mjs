export function agentEndpoint(serverUrl, path) {
  const url = new URL(serverUrl);
  const base = url.pathname.split('/').filter(Boolean).join('/');
  const suffix = path.split('/').filter(Boolean).join('/');
  url.pathname = `/${[base, suffix].filter(Boolean).join('/')}`;
  return url;
}

export async function agentRequest(serverUrl, token, path, body = {}, fetcher = fetch) {
  const response = await fetcher(agentEndpoint(serverUrl, path), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-pos-print-agent-token': token },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`POS server returned ${response.status}: ${text.slice(0, 300)}`);
  return response.status === 204 || !text.trim() ? null : JSON.parse(text);
}
