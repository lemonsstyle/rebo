const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../page-bridge.js'), 'utf8');
const fetchCommentsSource = source.slice(
  source.indexOf('  async function fetchComments('),
  source.indexOf('  async function fetchLongText(')
);

function harness(responses) {
  const requests = [];
  const window = {
    location: { origin: 'https://weibo.com' },
    $CONFIG: { uid: 'user-id' },
    fetch: async (url) => {
      requests.push(new URL(url));
      const payload = responses.shift();
      return {
        ok: true,
        status: 200,
        json: async () => payload
      };
    }
  };
  const context = vm.createContext({
    URL,
    window,
    createWeiboRequestHeaders: () => ({})
  });
  vm.runInContext(`
    function getCurrentUserId() { return window.$CONFIG.uid; }
    ${fetchCommentsSource}
  `, context);
  return { context, requests };
}

test('top-level comments use the original request parameters and preserve reply previews', async () => {
  const replies = [{ idstr: 'reply-1' }, { idstr: 'reply-2' }];
  const h = harness([
    { ok: 1, data: [{ idstr: 'comment-1', text_raw: '评论', total_number: 5, comments: replies }], total_number: 1 }
  ]);
  const result = await h.context.fetchComments('status-id');

  assert.equal(result.ok, true);
  assert.equal(result.payload.comments.length, 1);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].searchParams.get('id'), 'status-id');
  assert.equal(h.requests[0].searchParams.get('flow'), '0');
  assert.equal(h.requests[0].searchParams.get('fetch_level'), '0');
  assert.equal(h.requests[0].searchParams.get('is_reload'), '1');
  assert.equal(result.payload.comments[0].total_number, 5);
  assert.deepEqual(result.payload.comments[0].comments, replies);
});

test('reply expansion requests the parent comment and returns every reply', async () => {
  const replies = [1, 2, 3, 4, 5].map((id) => ({ idstr: `reply-${id}` }));
  const h = harness([
    { ok: 1, data: replies, total_number: 5, max_id: 0 }
  ]);
  const result = await h.context.fetchCommentReplies('status-id', 'parent-id');

  assert.equal(result.ok, true);
  assert.deepEqual(result.payload.comments, replies);
  assert.equal(result.payload.totalNumber, 5);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].searchParams.get('id'), 'parent-id');
  assert.equal(h.requests[0].searchParams.get('fetch_level'), '1');
  assert.equal(h.requests[0].searchParams.get('type'), 'feed');
  assert.equal(h.requests[0].searchParams.get('uid'), 'user-id');
});

test('accepts nested comment response envelopes', async () => {
  const h = harness([
    { ok: 1, data: { data: [{ idstr: 'comment-1', text_raw: '评论' }], total_number: 1 } }
  ]);
  const result = await h.context.fetchComments('status-id');

  assert.equal(result.ok, true);
  assert.equal(result.payload.comments[0].idstr, 'comment-1');
  assert.equal(h.requests.length, 1);
});

test('valid empty pages succeed without another request', async () => {
  const h = harness([{ ok: 1, data: [], max_id: 0, total_number: 0 }]);
  const result = await h.context.fetchComments('status-id', 'cursor-1');
  assert.equal(result.ok, true);
  assert.equal(result.payload.comments.length, 0);
  assert.equal(result.payload.maxId, 0);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].searchParams.get('max_id'), 'cursor-1');
  assert.equal(h.requests[0].searchParams.has('is_reload'), false);
});

test('server failures are not reported as empty comments', async () => {
  for (const flag of [0, false, '0', -100, '-100']) {
    const h = harness([{ ok: flag, msg: 'server error', data: [] }]);
    const result = await h.context.fetchComments('status-id');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'server error');
    assert.equal(h.requests.length, 1);
  }
});

test('missing or malformed comment arrays are not reported as empty comments', async () => {
  for (const payload of [null, {}, { ok: 1, data: {} }, { ok: 1, data: { comments: 'invalid' } }]) {
    const h = harness([payload]);
    const result = await h.context.fetchComments('status-id');
    assert.equal(result.ok, false);
    assert.match(result.reason, /格式异常/);
  }
});
