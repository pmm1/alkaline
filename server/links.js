import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import zlib from 'node:zlib';
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';

// Reads web pages the user pastes into a message so the model can judge them (e.g. recipe links).
// Only public http(s) addresses are fetched: private, loopback and link-local IPs are refused at every
// redirect hop and at DNS resolution time, so a link can't be used to reach services on the server.

const MAX_LINKS = 3;
const MAX_REDIRECTS = 5;
const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 12_000;
const MAX_PAGE_CHARS = 12_000;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

// ─── URL detection ────────────────────────────────────────────────────────────

const LINK_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;

/** The message text with links removed (used to title chats that are just a link). */
export function stripLinks(text) {
  return text.replace(LINK_PATTERN, ' ').replace(/\s+/g, ' ').trim();
}

export function findLinks(text) {
  const found = [];
  for (const match of text.matchAll(LINK_PATTERN)) {
    let raw = match[0];
    // Trim trailing punctuation, keeping a closing paren only if the URL opened one.
    while (/[.,;:!?'")\]}>]$/.test(raw)) {
      if (raw.endsWith(')') && (raw.match(/\(/g)?.length ?? 0) >= (raw.match(/\)/g)?.length ?? 0)) break;
      raw = raw.slice(0, -1);
    }
    try {
      const url = new URL(raw.startsWith('www.') ? `https://${raw}` : raw);
      url.hash = '';
      if (!found.includes(url.href)) found.push(url.href);
    } catch {}
    if (found.length >= MAX_LINKS) break;
  }
  return found;
}

// ─── Network safety ───────────────────────────────────────────────────────────

const blocked = new net.BlockList();
for (const [subnet, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked.addSubnet(subnet, prefix, 'ipv4');
for (const [subnet, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
]) blocked.addSubnet(subnet, prefix, 'ipv6');

function isPublicIp(ip) {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return isPublicIp(mapped[1]);
  const family = net.isIPv4(ip) ? 'ipv4' : net.isIPv6(ip) ? 'ipv6' : null;
  return family !== null && !blocked.check(ip, family);
}

class LinkError extends Error {}

// Used by http(s).request in place of dns.lookup, so the IP that is checked is the IP that is connected to.
function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const bad = addresses.find((a) => !isPublicIp(a.address));
    if (bad || addresses.length === 0) return callback(new LinkError('That address points to a private network.'));
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}

// ─── Fetching ─────────────────────────────────────────────────────────────────

function decompress(res) {
  const encoding = (res.headers['content-encoding'] || '').toLowerCase();
  if (encoding === 'gzip' || encoding === 'x-gzip') return res.pipe(zlib.createGunzip());
  if (encoding === 'deflate') return res.pipe(zlib.createInflate());
  if (encoding === 'br') return res.pipe(zlib.createBrotliDecompress());
  return res;
}

function requestOnce(url, signal) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.get(
      url,
      {
        lookup: safeLookup,
        signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve({ redirect: new URL(res.headers.location, url) });
        }
        const stream = decompress(res);
        const chunks = [];
        let size = 0;
        stream.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy();
            reject(new LinkError('The page is too large to read.'));
          } else chunks.push(chunk);
        });
        stream.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        stream.on('error', reject);
      }
    );
    req.on('error', reject);
  });
}

function assertFetchable(url) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new LinkError('Only http and https links can be read.');
  if (url.port && !['80', '443'].includes(url.port)) throw new LinkError('Links on unusual ports are not read.');
  if (url.username || url.password) throw new LinkError('Links with login details are not read.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && !isPublicIp(host)) throw new LinkError('That address points to a private network.');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new LinkError('That address points to a private network.');
  }
}

async function fetchPage(href, signal) {
  let url = new URL(href);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    assertFetchable(url);
    const result = await requestOnce(url, signal);
    if (result.redirect) {
      url = result.redirect;
      continue;
    }
    return { ...result, finalUrl: url };
  }
  throw new LinkError('Too many redirects.');
}

function decodeBody(body, contentType) {
  let charset = contentType.match(/charset=["']?([\w-]+)/i)?.[1];
  if (!charset) charset = body.subarray(0, 2048).toString('latin1').match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  try {
    return new TextDecoder(charset || 'utf-8').decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}

// ─── Extraction ───────────────────────────────────────────────────────────────

const clean = (s) =>
  String(s ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

function collectNodes(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => collectNodes(v, out));
  else if (value && typeof value === 'object') {
    out.push(value);
    if (value['@graph']) collectNodes(value['@graph'], out);
  }
  return out;
}

function instructionLines(value) {
  if (!value) return [];
  if (typeof value === 'string') return value.split(/\n+/).map(clean).filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(instructionLines);
  if (value.itemListElement) {
    const items = instructionLines(value.itemListElement);
    return value.name ? [`${clean(value.name)}:`, ...items] : items;
  }
  return [clean(value.text || value.name)].filter(Boolean);
}

// Most recipe sites embed a schema.org Recipe as JSON-LD, which is far cleaner than the page text.
function findRecipe(document) {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    let data;
    try {
      data = JSON.parse(script.textContent);
    } catch {
      continue;
    }
    const recipe = collectNodes(data).find((n) => [].concat(n['@type'] ?? []).includes('Recipe'));
    if (!recipe) continue;
    const ingredients = [].concat(recipe.recipeIngredient ?? recipe.ingredients ?? []).map(clean).filter(Boolean);
    const steps = instructionLines(recipe.recipeInstructions);
    if (!ingredients.length && !steps.length) continue;
    return {
      name: clean(recipe.name),
      yield: clean([].concat(recipe.recipeYield ?? [])[0]),
      ingredients,
      steps,
    };
  }
  return null;
}

function extract(html, url) {
  const { document } = parseHTML(html);
  const meta = (selector) => document.querySelector(selector)?.getAttribute('content')?.trim();
  const title = clean(meta('meta[property="og:title"]') || document.querySelector('title')?.textContent);
  const description = clean(meta('meta[property="og:description"]') || meta('meta[name="description"]'));
  const recipe = findRecipe(document);

  let text = '';
  try {
    document.querySelectorAll('script, style, noscript, svg, iframe, form').forEach((el) => el.remove());
    const article = new Readability(document, { charThreshold: 300 }).parse();
    text = article?.textContent ?? '';
  } catch {}
  if (text.trim().length < 200) text = document.body?.textContent ?? '';
  text = text.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{2,}/g, '\n').trim();

  return { title, description, recipe, text, host: url.hostname.replace(/^www\./, '') };
}

function formatForModel(href, page) {
  const lines = [`<linked_page url="${href}">`];
  if (page.title) lines.push(`Title: ${page.title}`);
  if (page.description) lines.push(`Description: ${page.description}`);
  let budget = MAX_PAGE_CHARS;
  if (page.recipe) {
    const r = page.recipe;
    const block = [
      '',
      `RECIPE (structured data from the page)${r.name ? `: ${r.name}` : ''}`,
      r.yield ? `Yield: ${r.yield}` : null,
      'Ingredients:',
      ...r.ingredients.map((i) => `- ${i}`),
      'Instructions:',
      ...r.steps.map((s, i) => `${i + 1}. ${s}`),
    ]
      .filter((l) => l !== null)
      .join('\n');
    lines.push(block.slice(0, budget));
    budget -= block.length;
    budget = Math.min(budget, 3000); // with a recipe, only a little surrounding text is useful
  }
  if (budget > 200 && page.text) {
    const text = page.text.length > budget ? `${page.text.slice(0, budget)}…` : page.text;
    lines.push('', 'PAGE TEXT:', text);
  }
  lines.push('</linked_page>');
  return lines.join('\n');
}

async function readLink(href, signal) {
  try {
    const res = await fetchPage(href, signal);
    if ([401, 402, 403, 429, 451].includes(res.status)) throw new LinkError('That site blocks automated reading. Paste the ingredients instead.');
    if (res.status >= 400) throw new LinkError(`The site answered with error ${res.status}.`);
    const type = String(res.headers['content-type'] || '').toLowerCase();
    if (type.includes('pdf')) throw new LinkError('PDFs can’t be read yet. Paste the ingredients instead.');
    if (type && !/html|xml|text\/plain|text\/markdown|json/.test(type)) throw new LinkError('That link isn’t a web page.');

    const body = decodeBody(res.body, type);
    const page = /html|xml/.test(type) || !type
      ? extract(body, res.finalUrl)
      : { title: '', description: '', recipe: null, text: body.trim(), host: res.finalUrl.hostname.replace(/^www\./, '') };

    if (!page.recipe && page.text.length < 80 && !page.description) {
      throw new LinkError('The page had almost no readable text (it may need JavaScript or a login).');
    }
    return {
      link: { url: href, ok: true, title: page.recipe?.name || page.title || page.host, host: page.host, recipe: Boolean(page.recipe) },
      context: formatForModel(href, page),
    };
  } catch (err) {
    const reason = err instanceof LinkError
      ? err.message
      : err.name === 'AbortError' || err.name === 'TimeoutError'
        ? 'The page took too long to load.'
        : err.code === 'ENOTFOUND'
          ? 'That website could not be found.'
          : 'The page could not be loaded.';
    let host = href;
    try { host = new URL(href).hostname.replace(/^www\./, ''); } catch {}
    return {
      link: { url: href, ok: false, title: host, host, error: reason },
      context: `<linked_page url="${href}" status="unreadable">\nCould not read this page: ${reason}\n</linked_page>`,
    };
  }
}

/** Fetches every link in the message. Returns per-link metadata for the UI and a text block for the model. */
export async function readLinks(urls, signal) {
  if (!urls.length) return { links: [], context: '' };
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const results = await Promise.all(urls.map((u) => readLink(u, combined)));
  return { links: results.map((r) => r.link), context: results.map((r) => r.context).join('\n\n') };
}

export const _test = { isPublicIp, assertFetchable };
