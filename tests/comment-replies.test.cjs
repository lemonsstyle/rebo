const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../content.js'), 'utf8');

function element() {
  return {
    children: [], classList: { add() {} }, events: {},
    get childNodes() { return this.children; },
    append(...children) { this.children.push(...children); },
    setAttribute() {},
    addEventListener(type, callback) { this.events[type] = callback; }
  };
}

function harness(count, request) {
  const replies = Array.from({ length: count }, (_, index) => ({ idstr: `reply-${index}` }));
  const parent = { idstr: 'parent', total_number: count, comments: replies.slice(0, 2) };
  const comments = { isConnected: true };
  const state = { comments: [parent], detailSessionId: 1 };
  const requests = [];
  let row;
  const context = vm.createContext({
    document: { createElement: element },
    hasValidExtensionContext: () => true, activeDetailSessionId: 1,
    getStatusId: () => 'status', getProfileUrl: () => '',
    getCommentReply: () => null, hasRichStatusText: () => false,
    plainText: () => '', appendPlainTextWithLinks() {},
    bridgeRequest: async (type, payload) => {
      requests.push({ type, ...payload });
      return request ? request(payload, requests.length) : { ok: true, payload: { comments: replies, maxId: 0 } };
    },
    renderDetailComments: () => render()
  });
  for (const [start, end] of [
    ['  function getCommentId(', '  function indexComments('],
    ['  function createCommentItem(', '  function createActionIcon('],
    ['  async function preloadCommentReplies(', '  async function loadDetailComments(']
  ]) vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end)), context);
  function render() {
    row = context.createCommentItem(parent, new Map(), new Set(), '', 0, {
      status: {}, comments, detailInteractions: {}, state
    });
  }
  render();
  return {
    parent, replies, state, comments, requests, context,
    load: () => context.preloadCommentReplies({}, comments, {}, state, parent),
    button: () => row.children[1].children.flatMap(child => child.children || []).find(child => child.className === 'weibo-grid-reader__comment-more-replies'),
    visible: () => row.children[1].children
      .find(child => child.className === 'weibo-grid-reader__comment-replies')?.children
      .filter(child => child.className === 'weibo-grid-reader__comment')?.length || 0
  };
}

test('preloading preserves two visible replies; clicks show ten then all without requests', async () => {
  for (const count of [3, 5, 10, 25]) {
    const h = harness(count);
    assert.equal(h.visible(), 2);
    await h.load();
    assert.equal(h.parent.comments.length, count);
    assert.equal(h.visible(), 2);
    h.button().events.click();
    assert.equal(h.visible(), Math.min(count, 10));
    if (count > 10) h.button().events.click();
    assert.equal(h.visible(), count);
    assert.equal(h.button(), undefined);
    assert.equal(h.requests.length, 1);
  }
});

test('preload traverses pages and deduplicates previews', async () => {
  const h = harness(25, (payload, call) => ({
    ok: true, payload: { comments: call === 1 ? h.replies.slice(0, 20) : h.replies.slice(18), maxId: call === 1 ? 'next' : 0 }
  }));
  await h.load();
  assert.equal(h.parent.comments.length, 25);
  assert.equal(h.requests[1].maxId, 'next');
  assert.equal(h.visible(), 2);
});

test('failed preload releases loading state and the retry button works', async () => {
  const h = harness(5, (payload, call) => call === 1
    ? { ok: false, reason: 'network failure' }
    : { ok: true, payload: { comments: h.replies, maxId: 0 } });
  await h.load();
  assert.equal(h.button().disabled, false);
  assert.match(h.button().textContent, /重试/);
  h.button().events.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.parent.__weiboGridRepliesError, false);
  h.button().events.click();
  assert.equal(h.visible(), 5);
});

test('repeated pagination cursor terminates with retry instead of endless loading', async () => {
  const h = harness(25, () => ({ ok: true, payload: { comments: h.replies.slice(0, 10), maxId: 'same' } }));
  await h.load();
  assert.equal(h.requests.length, 2);
  assert.equal(h.parent.__weiboGridRepliesLoading, false);
  assert.equal(h.parent.__weiboGridRepliesError, true);
});

test('closing or refreshing comments discards an in-flight reply response', async () => {
  for (const invalidate of [h => { h.comments.isConnected = false; }, h => { h.state.comments = []; }]) {
    let resolve;
    const h = harness(5, () => new Promise(done => { resolve = done; }));
    const pending = h.load();
    invalidate(h);
    resolve({ ok: true, payload: { comments: h.replies, maxId: 0 } });
    await pending;
    assert.equal(h.parent.comments.length, 2);
    assert.equal(h.parent.__weiboGridRepliesLoading, false);
  }
});
