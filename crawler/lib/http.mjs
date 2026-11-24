// Polite HTTP for the crawler and the link checker: identifiable User-Agent, a minimum gap per host,
// retries with backoff on 429/5xx (honouring Retry-After) and a hard timeout.

const lastHit = new Map();
const hostGap = new Map();

export const USER_AGENT = `FundusBot/0.1 (Katalog freier Assets; ${process.env.FUNDUS_KONTAKT || 'Kontakt siehe Impressum der Website'})`;

export function setHostGap(host, ms) {
  hostGap.set(host, ms);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForHost(host) {
  const gap = hostGap.get(host) ?? 1000;
  const last = lastHit.get(host) ?? 0;
  const wait = last + gap - Date.now();
  lastHit.set(host, Math.max(Date.now(), last + gap));
  if (wait > 0) await sleep(wait);
}

/**
 * @param {string} url
 * @param {{method?: string, headers?: object, timeout?: number, retries?: number, body?: any, redirect?: RequestRedirect}} [opts]
 * @returns {Promise<Response>}
 */
export async function politeFetch(url, opts = {}) {
  const { method = 'GET', headers = {}, timeout = 20000, retries = 3, body, redirect = 'follow' } = opts;
  const host = new URL(url).host;
  let attempt = 0;
  for (;;) {
    await waitForHost(host);
    let res;
    try {
      res = await fetch(url, {
        method,
        body,
        redirect,
        headers: { 'User-Agent': USER_AGENT, Accept: '*/*', ...headers },
        signal: AbortSignal.timeout(timeout),
      });
    } catch (err) {
      if (attempt >= retries) throw err;
      attempt++;
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    // GitHub signals an exhausted rate limit with 403 and x-ratelimit-remaining: 0; wait for the reset once.
    if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0' && attempt < retries) {
      attempt++;
      const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000 - Date.now();
      if (reset > 0 && reset <= 70000) {
        await res.body?.cancel().catch(() => {});
        await sleep(reset + 1000);
        continue;
      }
      return res;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      attempt++;
      const ra = Number(res.headers.get('retry-after'));
      await res.body?.cancel().catch(() => {});
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 120) * 1000 : 1500 * 2 ** attempt);
      continue;
    }
    return res;
  }
}

export async function getJson(url, opts = {}) {
  const res = await politeFetch(url, { ...opts, headers: { Accept: 'application/json', ...(opts.headers ?? {}) } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} bei ${url}: ${text.slice(0, 200)}`);
  }
  return res.json();
}
