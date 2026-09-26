const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const bridgeSource = fs.readFileSync(require.resolve('../page-bridge.js'), 'utf8');
const contentSource = fs.readFileSync(require.resolve('../content.js'), 'utf8');
function section(source, start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
}
function bridgeHarness(response = { ret: true, pic: { pid: 'server-picture-id' } }, event = 'load', imagesEnabled = true) {
  const requests = [];
  const posts = [];
  class XHR {
    constructor() { this.listeners = {}; this.status = 200; this.responseText = JSON.stringify(response); }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader() {}
    addEventListener(name, callback) { this.listeners[name] = callback; }
    send(body) { this.body = body; requests.push(this); this.listeners[event](); }
  }
  const window = {
    $CONFIG: { uid: 'test-user' }, location: { origin: 'https://weibo.com' },
    fetch: async (url, init) => {
      posts.push({ url, init });
      return { ok: true, json: async () => ({ ok: 1, data: {} }) };
    }
  };
  const context = vm.createContext({ COMMENT_IMAGES_ENABLED: imagesEnabled, window, document: { cookie: '' }, File, URL, URLSearchParams, XMLHttpRequest: XHR });
  vm.runInContext(section(bridgeSource, '  function readCookie(', '  function md5Buffer(')
    + section(bridgeSource, '  function md5Buffer(', '  async function getBotFingerprint(')
    + section(bridgeSource, '  async function getBotFingerprint(', '  async function postWeiboForm(')
    + section(bridgeSource, '  async function postWeiboForm(', '  function getTimelineGroupId(')
    + section(bridgeSource, '  async function createComment(', '  async function setCommentLike('), context);
  return { context, requests, posts };
}

test('upload carries credentials, preserves bytes and returns server pid', async () => {
  const { context, requests } = bridgeHarness();
  const file = new File(['image-content'], 'image.png', { type: 'image/png' });
  const result = await context.uploadCommentImage(file);
  assert.equal(result.ok, true);
  assert.equal(result.payload.pid, 'server-picture-id');
  assert.equal(requests[0].withCredentials, true);
  assert.equal(requests[0].timeout, 60000);
  assert.equal(Buffer.from(requests[0].body).toString(), 'image-content');
  assert.equal(new URL(requests[0].url).searchParams.get('raw_md5'), createHash('md5').update('image-content').digest('hex'));
});

test('CRC-32 uses raw bytes and an unsigned result', () => {
  const { context } = bridgeHarness();
  assert.equal(context.crc32Buffer(new ArrayBuffer(0)), 0);
  assert.equal(context.crc32Buffer(new TextEncoder().encode('123456789').buffer), 0xcbf43926);
  assert.equal(context.crc32Buffer(Uint8Array.from({ length: 256 }, (_, index) => index).buffer), 0x29058c73);
});

test('upload cs is the checksum of the actual request body, stable across retries', async () => {
  const { context, requests } = bridgeHarness();
  const file = new File(['123456789'], 'image.png');
  await context.uploadCommentImage(file);
  await context.uploadCommentImage(file);
  for (const request of requests) {
    assert.equal(Buffer.from(request.body).toString(), '123456789');
    assert.equal(new URL(request.url).searchParams.get('cs'), '3421780262');
  }
});

test('HTTP 200 with errno -1, -2 or no pid is still a failure', async () => {
  for (const payload of [{ ret: false, errno: -1 }, { ret: false, errno: -2 }, { ret: true }]) {
    const { context } = bridgeHarness(payload);
    const result = await context.uploadCommentImage(new File(['x'], 'image.png'));
    assert.equal(result.ok, false);
    assert.equal(result.payload, undefined);
  }
});

test('upload timeout is reported as a retryable failure', async () => {
  const { context } = bridgeHarness({}, 'timeout');
  const result = await context.uploadCommentImage(new File(['x'], 'image.png'));
  assert.equal(result.ok, false);
  assert.match(result.reason, /超时/);
});

test('image-only and image-with-text comments and replies send pic_id', async () => {
  const { context, posts } = bridgeHarness();
  for (const text of ['', 'comment text']) {
    assert.equal((await context.createComment('status-id', text, false, 'server-picture-id')).ok, true);
    assert.equal((await context.createCommentReply('status-id', 'parent-id', text, 'server-picture-id')).ok, true);
  }
  assert.equal(posts.length, 4);
  for (const { init } of posts) {
    assert.equal(new URLSearchParams(init.body).get('pic_id'), 'server-picture-id');
  }
  assert.equal(posts[1].url.pathname, '/ajax/comments/reply');
  assert.equal(new URLSearchParams(posts[1].init.body).get('cid'), 'parent-id');
});

function pickerHarness(imagesEnabled = true) {
  class Element {
    constructor() { this.style = {}; this.listeners = {}; this.children = []; this.classList = { toggle() {} }; }
    setAttribute() {}
    append(...children) { this.children.push(...children); }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    dispatchEvent(event) { return this.listeners[event.type]?.(event); }
  }
  let resolveUpload;
  const uploads = [];
  const revoked = [];
  const context = vm.createContext({
    COMMENT_IMAGES_ENABLED: imagesEnabled, document: { createElement: () => new Element() }, Event,
    URL: { createObjectURL: () => 'blob:local-preview', revokeObjectURL: (url) => revoked.push(url) },
    bridgeRequest: (type, payload) => new Promise((resolve) => {
      uploads.push({ type, ...payload });
      resolveUpload = resolve;
    })
  });
  vm.runInContext(section(contentSource, '  function createCommentImagePicker(', '  function clearCommentImagePickers('), context);
  const textarea = new Element();
  const picker = context.createCommentImagePicker(textarea);
  const input = picker.children[0];
  const api = picker.__weiboGridImagePicker;
  const changes = [];
  picker.addEventListener('weibo-image-state', () => changes.push({ blocking: api.isBlocking(), pid: api.getPicId() }));
  const select = () => {
    input.files = [{ name: 'image.png' }];
    input.value = 'image.png';
    return input.dispatchEvent(new Event('change'));
  };
  return { picker, api, input, textarea, uploads, changes, select, finish: (result) => resolveUpload(result), revoked };
}

function pasteEvent(files = [], textOnly = false) {
  return {
    type: 'paste', defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    clipboardData: {
      items: textOnly ? [{ kind: 'string', type: 'text/plain' }] : files.map((file) => ({
        kind: 'file', type: file.type, getAsFile: () => file
      })),
      files
    }
  };
}

test('pasted image uploads first clipboard image, then can replace the ready image', async () => {
  const h = pickerHarness();
  const files = [new File(['first'], 'a.png', { type: 'image/png' }), new File(['second'], 'b.png', { type: 'image/png' })];
  const event = pasteEvent(files);
  const upload = h.textarea.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(h.api.isBlocking(), true);
  assert.equal(h.uploads.length, 1);
  assert.equal(h.uploads[0].type, 'upload-comment-image');
  assert.equal(h.uploads[0].file, files[0]);
  h.textarea.dispatchEvent(pasteEvent(files));
  assert.equal(h.uploads.length, 1);
  h.finish({ ok: true, payload: { pid: 'first-pid' } });
  await upload;
  const replacement = h.textarea.dispatchEvent(pasteEvent([files[1]]));
  assert.equal(h.api.getPicId(), '');
  assert.equal(h.revoked.length, 1);
  h.finish({ ok: true, payload: { pid: 'second-pid' } });
  await replacement;
  assert.equal(h.api.getPicId(), 'second-pid');
});

test('text paste remains native and disabled composers do not upload', () => {
  const h = pickerHarness();
  const text = pasteEvent([], true);
  h.textarea.dispatchEvent(text);
  assert.equal(text.defaultPrevented, false);
  const files = [new File(['image'], 'a.png', { type: 'image/png' })];
  h.api.setDisabled(true);
  h.textarea.dispatchEvent(pasteEvent(files));
  h.api.setDisabled(false);
  h.textarea.disabled = true;
  h.textarea.dispatchEvent(pasteEvent(files));
  assert.equal(h.uploads.length, 0);
});

test('clipboard files fallback uploads and failure keeps submission blocked', async () => {
  const h = pickerHarness();
  const event = pasteEvent([new File(['image'], 'a.png', { type: 'image/png' })]);
  event.clipboardData.items = [];
  const upload = h.textarea.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  h.finish({ ok: false, reason: 'upload failed' });
  await upload;
  assert.equal(h.api.isBlocking(), true);
  assert.equal(h.api.getPicId(), '');
});

test('failed local preview blocks sending; the same file can be retried successfully', async () => {
  const h = pickerHarness();
  assert.equal(h.api.isBlocking(), false);
  const uploading = h.select();
  assert.equal(h.input.value, '');
  assert.equal(h.changes[0].blocking, true);
  h.finish({ ok: false, reason: 'errno -1' });
  await uploading;
  assert.equal(h.api.isBlocking(), true);
  assert.equal(h.api.getPicId(), '');
  const retry = h.select();
  h.finish({ ok: true, payload: { pid: 'new-pid' } });
  await retry;
  assert.equal(h.api.isBlocking(), false);
  assert.equal(h.api.getPicId(), 'new-pid');
  h.api.clear();
  assert.equal(h.api.getPicId(), '');
  assert.equal(h.api.isBlocking(), false);
});

test('removing a failed image unblocks text; removing during upload ignores late success', async () => {
  const h = pickerHarness();
  const first = h.select();
  h.finish({ ok: false });
  await first;
  h.api.clear();
  assert.equal(h.api.isBlocking(), false);
  const second = h.select();
  h.api.clear();
  h.finish({ ok: true, payload: { pid: 'stale-pid' } });
  await second;
  assert.equal(h.api.getPicId(), '');
  assert.equal(h.api.isBlocking(), false);
});

test('Thanos disables image entry and requests while preserving text comments', async () => {
  assert.match(contentSource, /const COMMENT_IMAGES_ENABLED = false;/);
  assert.match(bridgeSource, /const COMMENT_IMAGES_ENABLED = false;/);
  const h = pickerHarness(false);
  assert.equal(h.picker.hidden, true);
  assert.equal(h.picker.style.display, 'none');
  assert.equal(h.picker.children.length, 0);
  assert.equal(h.textarea.listeners.paste, undefined);
  assert.equal(h.api.isBlocking(), false);
  const { context, requests, posts } = bridgeHarness(undefined, 'load', false);
  assert.equal((await context.uploadCommentImage(new File(['x'], 'x.png'))).ok, false);
  assert.equal((await context.createComment('status', 'text', false, 'pic')).ok, false);
  assert.equal((await context.createCommentReply('status', 'parent', 'text', 'pic')).ok, false);
  assert.equal(requests.length, 0);
  assert.equal(posts.length, 0);
  assert.equal((await context.createComment('status', 'text')).ok, true);
  assert.equal((await context.createCommentReply('status', 'parent', 'text')).ok, true);
  assert.equal(posts.length, 2);
});
