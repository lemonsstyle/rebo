const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function section(file, start, end) {
  const source = fs.readFileSync(require.resolve(file), 'utf8');
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
}
test('delete uses official JSON endpoint and refuses unknown or other authors', async () => {
  const requests = [];
  let payload = { ok: 1 };
  const context = vm.createContext({ URL, getCurrentUserId: () => 'me', createWeiboRequestHeaders: () => ({ 'X-XSRF-TOKEN': 'test' }), window: {
    location: { origin: 'https://weibo.com' }, fetch: async (url, init) => {
      requests.push({ url, init }); return { ok: true, status: 200, json: async () => payload };
    }
  } });
  vm.runInContext(section('../page-bridge.js', '  async function deleteComment(', '  async function setCommentLike('), context);
  for (const author of ['', 'someone-else']) assert.equal((await context.deleteComment('123', author)).ok, false);
  assert.equal((await context.deleteComment('', 'me')).ok, false);
  assert.equal(requests.length, 0);
  assert.equal((await context.deleteComment('123', 'me')).ok, true);
  assert.equal(requests[0].url.pathname, '/ajax/statuses/destroyComment');
  assert.equal(requests[0].init.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(requests[0].init.body), { cid: '123', filter: {} });
  assert.equal(requests[0].init.headers['Content-Type'], 'application/json');
  for (const value of [{ ok: 0, msg: 'denied' }, {}, null]) {
    payload = value;
    assert.equal((await context.deleteComment('123', 'me')).ok, false);
  }
});
function ui(author = 'me', currentUserId = 'me') {
  class Element {
    constructor() { this.children = []; this.classList = { toggle() {}, add() {}, remove() {} }; }
    append(...items) { for (const item of items) if (!this.children.includes(item)) this.children.push(item); }
    setAttribute() {}
    addEventListener() {}
    remove() { this.removed = true; }
  }
  const header = new Element(), content = new Element(), row = new Element();
  content.querySelector = () => header;
  row.querySelector = () => content;
  const state = { currentUserId, requestVersion: 0, loading: false };
  const requests = [];
  let confirmed = true, resolveRequest, reloads = 0;
  const context = vm.createContext({ Element, document: { createElement: () => new Element() },
    window: { confirm: () => confirmed },
    detailCommentStates: { get: () => state },
    createCommentZone: (type, click) => Object.assign(new Element(), { type, click }),
    isCommentLiked: () => false, getCommentId: c => c.idstr,
    bridgeRequest: (type, data) => new Promise(resolve => { requests.push({ type, data }); resolveRequest = resolve; }),
    cleanupCommentTransientPickers() {}, getNonNegativeCount: n => Math.max(0, n), updateStatusMetric() {},
    loadDetailComments: async () => { reloads++; }
  });
  vm.runInContext(section('../content.js', '  function attachCommentZones(', '  function createCommentZone('), context);
  const status = { comments_count: 2 };
  context.attachCommentZones(row, status, { idstr: '123', user: { idstr: author } }, {}, {});
  return { zones: header.children[0].children, row, content, status, requests, state,
    confirm: value => { confirmed = value; }, finish: value => resolveRequest(value), reloads: () => reloads };
}
test('delete appears before repost only for own comments', () => {
  assert.deepEqual(ui().zones.map(z => z.type), ['delete', 'repost', 'comment', 'like']);
  assert.deepEqual(ui('other').zones.map(z => z.type), ['repost', 'comment', 'like']);
  assert.deepEqual(ui('me', '').zones.map(z => z.type), ['repost', 'comment', 'like']);
});
test('cancel sends nothing; pending clicks are ignored; success removes and reloads', async () => {
  const h = ui(), button = h.zones[0];
  h.confirm(false); await button.click(); assert.equal(h.requests.length, 0);
  h.confirm(true); const pending = button.click(); await button.click();
  assert.equal(h.requests.length, 1); assert.equal(button.disabled, true);
  assert.equal(h.row.removed, undefined);
  h.finish({ ok: true }); await pending;
  assert.equal(h.row.removed, true); assert.equal(h.status.comments_count, 1); assert.equal(h.reloads(), 1);
});
test('failure retains comment and permits retry with visible error', async () => {
  const h = ui(), button = h.zones[0];
  const pending = button.click(); h.finish({ ok: false, reason: 'denied' }); await pending;
  assert.equal(h.row.removed, undefined); assert.equal(h.status.comments_count, 2);
  assert.equal(button.disabled, false); assert.match(h.content.children[0].textContent, /denied/);
});
