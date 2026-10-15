/**
 * Cloudflare Pages Function: API Proxy
 * Forwards /api/* requests to the backend service.
 * Supports HTTP methods and WebSocket upgrades.
 */
interface Env {
  BACKEND_URL?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const backendBase = context.env.BACKEND_URL || 'https://daleel-e-haq-production.up.railway.app';
  const url = new URL(context.request.url);
  const targetUrl = new URL(url.pathname + url.search, backendBase);

  // Preserve request headers while removing cloudflare-internal headers
  const newHeaders = new Headers(context.request.headers);
  newHeaders.set('X-Forwarded-Host', url.host);
  newHeaders.set('X-Forwarded-Proto', url.protocol.replace(':', ''));

  // Handle WebSocket upgrade
  const upgradeHeader = context.request.headers.get('Upgrade');
  if (upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') {
    return fetch(targetUrl.toString(), {
      method: context.request.method,
      headers: newHeaders
    });
  }

  // Handle standard HTTP request
  const requestInit: RequestInit = {
    method: context.request.method,
    headers: newHeaders,
    redirect: 'follow'
  };

  if (!['GET', 'HEAD'].includes(context.request.method) && context.request.body) {
    requestInit.body = context.request.body;
  }

  try {
    const response = await fetch(targetUrl.toString(), requestInit);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: 'Backend Service Unavailable',
        message: 'Could not connect to Daleel-e-Haq backend service.'
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};
