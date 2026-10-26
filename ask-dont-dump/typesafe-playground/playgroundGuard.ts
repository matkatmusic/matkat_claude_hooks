export function listAllowedHosts(hostname: string, port: number): string[] {
  return [`${hostname}:${port}`, `localhost:${port}`];
}

export function isRequestAllowed(request: Request, hostname: string, port: number): boolean {
  const allowedHosts = listAllowedHosts(hostname, port);
  const host = request.headers.get('host');
  const isHostAllowed = host !== null && allowedHosts.includes(host);
  if (!isHostAllowed)
    return false;
  if (request.method !== 'POST')
    return true;
  const origin = request.headers.get('origin');
  let isOriginAllowed = false;
  for (const allowedHost of allowedHosts) {
    if (origin === `http://${allowedHost}`)
      isOriginAllowed = true;
  }
  if (!isOriginAllowed)
    return false;
  const contentType = request.headers.get('content-type');
  if (contentType === null)
    return false;
  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  return mediaType === 'application/json';
}
