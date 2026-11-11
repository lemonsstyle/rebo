const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const bridgeSource = fs.readFileSync(require.resolve('../page-bridge.js'), 'utf8');
const contentSource = fs.readFileSync(require.resolve('../content.js'), 'utf8');
function section(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert(a >= 0 && b > a);
  return source.slice(a, b);
}
function bridge(fetch = async () => ({ ok: true, json: async () => ({ ok: 1 }) })) {
  const window = { location: { origin: 'https://weibo.com', href: 'https://weibo.com/mygroups?gid=B' },
    fetch, addEventListener() {}, setTimeout };
  function XHR() {}
  XHR.prototype = { open() {}, send() {} };
  const context = vm.createContext({ window, document: { cookie: '' }, URL, URLSearchParams,
    performance, XMLHttpRequest: XHR });
  vm.runInContext(bridgeSource.replace('  installOfficialTimelineObserver();', `globalThis.api = {
    storeOfficialTimeline, getFreshOfficialTimelineForRequest, postWeiboForm,
    requestTimeline, installOfficialTimelineObserver, observedTimelineEndpointByGroup
  };`), context);
  return context;
}

test('cached first page never crosses a group boundary', () => {
  const h = bridge();
  h.api.storeOfficialTimeline(new URL('https://weibo.com/ajax/feed/groupstimeline?list_id=A'),
    { statuses: [{ idstr: 'A-post' }], max_id: 'A-cursor' }, 'gid=A');
  assert.equal(h.api.getFreshOfficialTimelineForRequest('gid=B', 'B', Date.now() - 1000), null);
  assert.equal(h.api.getFreshOfficialTimelineForRequest('gid=A', 'A', Date.now() - 1000).statuses[0].idstr, 'A-post');
});

test('write responses require explicit success', async () => {
  for (const payload of [{}, { ok: 'invalid' }, { ret: 0 }, { ok: 0 }, null, { ok: 1 }, { ok: '1' }]) {
    const h = bridge(async () => ({ ok: true, status: 200, json: async () => payload }));
    const response = await h.api.postWeiboForm('/ajax/comments/create', { id: '1', comment: 'text' }, 'test');
    assert.equal(response.ok, Number(payload?.ok) === 1);
  }
});

test('official request remains observable while reader request is pending', async () => {
  const pending = [];
  const h = bridge(() => new Promise(resolve => pending.push(resolve)));
  h.api.installOfficialTimelineObserver();
  const own = h.api.requestTimeline(new URL('https://weibo.com/ajax/feed/groupstimeline?list_id=A'));
  const official = h.window.fetch('https://weibo.com/ajax/feed/groupstimeline?list_id=B');
  const response = { ok: true, json: async () => ({ statuses: [] }), clone() { return this; } };
  pending[1](response);
  await official;
  assert.equal(h.api.observedTimelineEndpointByGroup.has('B'), true);
  pending[0](response);
  await own;
});

function timeline() {
  const pending = [];
  const messages = [];
  let restored = 0;
  const h = vm.createContext({ readerLoading: false, readerExhausted: false, settings: { readerEnabled: true },
    bridgeReady: true, readerActive: false, readerSeenIds: new Set(), readerGeneration: 1, readerRouteKey: 'gid=A',
    readerMaxId: '', readerWarmStartRouteKey: '', readerSelectionRouteKey: '',
    hasValidExtensionContext: () => true, isFeedRoute: () => true, getFeedQuery: () => ({}),
    getReaderRouteKey: () => h.readerRouteKey,
    bridgeRequest: () => new Promise(resolve => pending.push(resolve)),
    activateReaderSurface: () => { h.readerActive = true; return true; },
    restoreNativeFeed: () => restored++, cancelReaderRetry() {}, cancelLoadMoreRetry() {},
    setReaderLoadStatus: message => messages.push(message)
  });
  vm.runInContext(section(contentSource, '  async function loadTimeline(', '  function resetReader('), h);
  return { h, pending, messages, restored: () => restored };
}

test('stale response cannot unlock the current generation', async () => {
  const { h, pending } = timeline();
  const a = h.loadTimeline();
  h.readerGeneration++; h.readerRouteKey = 'gid=B'; h.readerLoading = false;
  const b = h.loadTimeline();
  pending[0]({ ok: false }); await a;
  assert.equal(h.readerLoading, true);
  pending[1]({ ok: true, payload: { statuses: [], maxId: 0 } }); await b;
  assert.equal(h.readerLoading, false);
});

test('valid empty group activates a stable empty state without retry', async () => {
  const { h, pending, messages, restored } = timeline();
  const request = h.loadTimeline();
  pending[0]({ ok: true, payload: { statuses: [], maxId: 0 } }); await request;
  assert.equal(h.readerExhausted, true);
  assert.equal(h.readerActive, true);
  assert.equal(restored(), 0);
  assert.match(messages[0], /暂无微博/);
  await h.loadTimeline();
  assert.equal(pending.length, 1);
});

test('write timeout communicates uncertain outcome; read timeout does not', async () => {
  for (const type of ['create-comment', 'create-repost', 'delete-comment', 'fetch-comments']) {
    let timeout;
    const pending = new Map();
    const h = vm.createContext({ pendingBridgeRequests: pending, CHANNEL: 'test', BRIDGE_SESSION_ID: 'session',
      hasValidExtensionContext: () => true, window: { location: { origin: 'https://weibo.com' },
        setTimeout(fn) { timeout = fn; }, clearTimeout() {}, postMessage() {} } });
    vm.runInContext(section(contentSource, '  function bridgeRequest(', '  function createReaderSurface('), h);
    const request = h.bridgeRequest(type);
    timeout();
    const response = await request;
    assert.equal(response.uncertain, type !== 'fetch-comments');
    if (response.uncertain) assert.match(response.reason, /确认未成功后再重试/);
    assert.equal(pending.size, 0);
  }
});

test('comment quote preserves literal markup in text_raw', () => {
  const h = vm.createContext({ plainText() { throw new Error('raw text must not be parsed'); } });
  vm.runInContext(section(contentSource, '  function buildCommentQuoteText(', '  function insertCommentEmoji('), h);
  const raw = '<img src=x onerror=alert(1)>';
  assert.equal(h.buildCommentQuoteText({ user: { screen_name: 'author' }, text_raw: raw }), `//@author: ${raw}`);
});
