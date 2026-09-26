const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../content.js'), 'utf8');
function harness() {
  let scrollTop = 900, cleanups = 0;
  const attached = [];
  const comments = {
    children: [],
    replaceChildren() { this.children = []; },
    append(...rows) { this.children.push(...rows); },
    querySelectorAll() { return this.children.flatMap(row => [row, ...(row.nested || [])]); }
  };
  const measure = () => { if (!comments.children.length) scrollTop = 0; };
  const context = vm.createContext({
    Set,
    document: { createElement: () => ({}) },
    getCommentId: c => c.id || '',
    indexComments: () => new Map(),
    cleanupCommentTransientPickers: () => { cleanups++; },
    repositionActiveDetail: measure,
    attachCommentZones: row => attached.push(row),
    createCommentItem: (comment, byId, ids) => {
      if (comment.id && ids.has(comment.id)) return null;
      if (comment.id) ids.add(comment.id);
      return { __weiboGridComment: comment, querySelectorAll: () => [] };
    }
  });
  vm.runInContext(source.slice(source.indexOf('  function renderDetailComments('), source.indexOf('  async function loadDetailComments(')), context);
  const state = { comments: [], hasMore: true, loadMoreSentinel: {}, onVisibilityChange: measure };
  return { comments, state, attached, context, cleanups: () => cleanups, scrollTop: () => scrollTop,
    render: (append = false) => context.renderDetailComments({ user: {} }, comments, {}, state, append) };
}

test('pagination preserves existing nodes, nested replies, drafts and scroll position', () => {
  const h = harness();
  const first = { id: '1' }, nested = { id: 'reply' }, next = { id: '2' };
  h.state.comments = [first]; h.render();
  const existing = h.comments.children[0];
  existing.draft = 'unfinished reply';
  existing.nested = [{ __weiboGridComment: nested }];
  h.state.comments.push({ id: '1' }, nested, next);
  h.render(true);
  assert.equal(h.comments.children.length, 2);
  assert.equal(h.comments.children[0], existing);
  assert.equal(existing.draft, 'unfinished reply');
  assert.equal(h.comments.children[1].__weiboGridComment, next);
  assert.equal(h.scrollTop(), 900);
  assert.equal(h.cleanups(), 1);
  assert.equal(h.attached.length, 2);
  h.state.hasMore = false;
  h.render(true);
  assert.equal(h.comments.children.length, 2);
  assert.equal(h.state.loadMoreSentinel.hidden, true);
  assert.equal(h.scrollTop(), 900);
});

test('explicit refresh replaces stale comments and cleans up their composers', () => {
  const h = harness();
  h.state.comments = [{ id: 'old' }]; h.render();
  h.state.comments = [{ id: 'new' }]; h.render();
  assert.equal(h.comments.children.length, 1);
  assert.equal(h.comments.children[0].__weiboGridComment.id, 'new');
  assert.equal(h.cleanups(), 2);
});

test('async pagination passes append mode and rejects a stale response', async () => {
  let resolveRequest;
  const calls = [];
  const comments = { dataset: {}, isConnected: true, setAttribute() {} };
  const state = { comments: [{ id: 'old' }], commentIds: new Set(['old']), hasMore: true,
    requestVersion: 0, detailSessionId: 1, maxId: 'cursor1', loadMoreSentinel: {}, totalNumber: 100, noProgressCount: 0 };
  const context = vm.createContext({
    detailCommentStates: { get: () => state }, activeDetailSessionId: 1,
    getStatusId: () => 'status', getCommentId: c => c.id,
    hasValidExtensionContext: () => true,
    preloadCommentReplies: async () => {},
    bridgeRequest: () => new Promise(resolve => { resolveRequest = resolve; }),
    renderDetailComments: (...args) => calls.push(args[4])
  });
  vm.runInContext(source.slice(source.indexOf('  async function loadDetailComments('), source.indexOf('  function closeDetail(')), context);
  const pending = context.loadDetailComments({}, comments, {}, true);
  resolveRequest({ ok: true, payload: { comments: [{ id: 'new' }], maxId: 'cursor2' } });
  await pending;
  assert.deepEqual(calls, [true]);
  assert.equal(state.comments.length, 2);
  const stale = context.loadDetailComments({}, comments, {}, true);
  state.requestVersion++;
  resolveRequest({ ok: true, payload: { comments: [{ id: 'stale' }] } });
  await stale;
  assert.equal(state.comments.length, 2);
  assert.equal(calls.length, 1);
});

test('request rejection clears loading and leaves a retryable error state', async () => {
  const busyStates = [];
  const calls = [];
  const comments = {
    dataset: {},
    isConnected: true,
    setAttribute(name, value) { if (name === 'aria-busy') busyStates.push(value); }
  };
  const state = {
    comments: [{ id: 'old' }],
    commentIds: new Set(['old']),
    hasMore: false,
    requestVersion: 0,
    detailSessionId: 1,
    maxId: '',
    loadMoreSentinel: {},
    totalNumber: 1,
    noProgressCount: 0
  };
  const context = vm.createContext({
    detailCommentStates: { get: () => state }, activeDetailSessionId: 1,
    getStatusId: () => 'status', hasValidExtensionContext: () => true,
    bridgeRequest: async () => { throw new Error('network failure'); },
    renderDetailComments: (...args) => calls.push(args[4]),
    preloadCommentReplies: async () => {}
  });
  vm.runInContext(source.slice(source.indexOf('  async function loadDetailComments('), source.indexOf('  function closeDetail(')), context);
  await context.loadDetailComments({}, comments, {}, false);
  assert.equal(state.loading, false);
  assert.equal(state.error, 'network failure');
  assert.deepEqual(busyStates, ['true', 'false']);
  assert.deepEqual(calls, [undefined]);
});
