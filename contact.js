export const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
export const CONTACT_SUCCESS = '已收到，会尽快回复';
const GENERIC_FAILURE = '暂时无法发送，请稍后重试。';
const turnstileLoads = new WeakMap();
export const LOCAL_VERIFICATION = 'local-captcha-v1';

export function validateContactFields(input) {
  const values = {
    name: typeof input.name === 'string' ? input.name.trim() : '',
    email: typeof input.email === 'string' ? input.email.trim() : '',
    message: typeof input.message === 'string' ? input.message.trim() : '',
    website: typeof input.website === 'string' ? input.website.trim() : '',
  };
  const errors = {};
  if (!values.name || values.name.length > 80) errors.name = '请填写你的名字，最多 80 字。';
  if (!values.email || values.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(values.email)) errors.email = '请填写有效的回复邮箱，最多 254 字。';
  if (!values.message || values.message.length > 5000) errors.message = '请填写留言，最多 5000 字。';
  return { values, errors, valid: Object.keys(errors).length === 0 };
}

export function validContactConfig(value) {
  if (!value || value.enabled !== true) return false;
  if (value.verification === LOCAL_VERIFICATION) return value.siteKey === '';
  return value.verification === undefined && typeof value.siteKey === 'string'
    && /^[A-Za-z0-9_-]{3,100}$/u.test(value.siteKey);
}

export function validContactChallenge(value) {
  if (!value || typeof value.token !== 'string' || value.token.length < 16 || value.token.length > 2048
    || !/^[\x21-\x7e]+$/u.test(value.token) || typeof value.image !== 'string'
    || value.image.length < 44 || value.image.length > 131072 || value.image.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value.image)
    || !Number.isSafeInteger(value.width) || value.width < 32 || value.width > 640
    || !Number.isSafeInteger(value.height) || value.height < 16 || value.height > 240
    || !Number.isSafeInteger(value.expiresAt) || value.expiresAt < 1
    || !Number.isSafeInteger(value.expiresInMs) || value.expiresInMs < 1 || value.expiresInMs > 180000) return false;
  try {
    const prefix = Uint8Array.from(atob(value.image.slice(0, 44)), char => char.charCodeAt(0));
    const view = new DataView(prefix.buffer);
    return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => prefix[index] === byte)
      && view.getUint32(8) === 13 && view.getUint32(12) === 0x49484452
      && view.getUint32(16) === value.width && view.getUint32(20) === value.height;
  } catch { return false; }
}

export function loadTurnstile(win, doc) {
  const pending = turnstileLoads.get(win);
  if (pending) return pending;
  if (win.turnstile && typeof win.turnstile.render === 'function') return Promise.resolve(win.turnstile);
  const loading = new Promise((resolve, reject) => {
    const script = doc.createElement('script');
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      win.clearTimeout(timer);
      if (error) { script.remove(); reject(error); }
      else resolve(win.turnstile);
    };
    const timer = win.setTimeout(() => finish(new Error('Verification unavailable')), 15_000);
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.onload = () => {
      const api = win.turnstile;
      if (!api || typeof api.render !== 'function') { finish(new Error('Verification unavailable')); return; }
      // An async script's load event is the readiness signal; ready() rejects
      // async/defer integrations even after api.js has finished executing.
      finish();
    };
    script.onerror = () => finish(new Error('Verification unavailable'));
    try { doc.head.append(script); }
    catch { finish(new Error('Verification unavailable')); }
  });
  turnstileLoads.set(win, loading);
  const release = () => { if (turnstileLoads.get(win) === loading) turnstileLoads.delete(win); };
  void loading.then(release, release);
  return loading;
}

export function decodeContactCaptchaImage(src, { doc, signal }) {
  return new Promise((resolve, reject) => {
    const image = doc.createElement('img');
    let settled = false;
    const cancelled = () => finish(new Error('Verification image unavailable'));
    const finish = (error) => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener('abort', cancelled);
      image.removeAttribute('src');
      if (error) reject(error);
      else resolve();
    };
    image.onload = () => finish();
    image.onerror = () => finish(new Error('Verification image unavailable'));
    signal.addEventListener('abort', cancelled, { once: true });
    if (signal.aborted) { cancelled(); return; }
    try { image.src = src; }
    catch { finish(new Error('Verification image unavailable')); }
  });
}

export function initContactForm({ doc, win, fetcher, loadWidget = () => loadTurnstile(win, doc), clock = () => win.performance?.now() ?? Date.now(),
  decodeCaptchaImage = (src, { signal }) => decodeContactCaptchaImage(src, { doc, signal }) }) {
  const get = (id) => doc.getElementById(id);
  const form = get('contact-form');
  if (!form) return null;
  const fields = get('contact-fields');
  const submit = get('contact-submit');
  const retry = get('contact-retry');
  const status = get('contact-status');
  const verificationStatus = get('contact-verification-status');
  const container = get('contact-turnstile');
  const captcha = get('contact-captcha');
  const captchaImage = get('contact-captcha-image');
  const captchaAnswer = get('contact-captcha-answer');
  const captchaRefresh = get('contact-captcha-refresh');
  const captchaZoom = get('contact-captcha-zoom');
  const controls = { name: get('contact-name'), email: get('contact-email'), message: get('contact-message'), website: get('contact-website') };
  const state = { enabled: false, busy: false, token: '', widget: null, widgetId: null, disposed: false, epoch: 0,
    verification: null, challengeEpoch: 0, expiresAt: 0 };
  let configController;
  let sendController;
  let challengeController;
  let expiryTimer;
  function tell(message, phase = '') {
    status.textContent = message;
    status.dataset.state = phase;
  }
  function ready() {
    const local = state.verification === LOCAL_VERIFICATION;
    const verified = !!state.token && (!local || state.expiresAt > clock() && /^[A-Z0-9]{6}$/u.test(captchaAnswer.value));
    submit.disabled = !state.enabled || !verified || state.busy || state.disposed;
    retry.disabled = state.busy;
    if (captchaAnswer) captchaAnswer.disabled = !local || !state.enabled || !state.token || state.busy || state.disposed;
    if (captchaRefresh) captchaRefresh.disabled = !local || !state.enabled || state.busy || state.disposed;
    if (captchaZoom) captchaZoom.disabled = !local || !state.token || state.busy || state.disposed;
  }
  function busy(value) {
    state.busy = value;
    fields.disabled = value;
    form.setAttribute('aria-busy', String(value));
    submit.textContent = value ? '发送中…' : '发送留言 ↗';
    ready();
  }
  function showErrors(errors = {}) {
    for (const name of ['name', 'email', 'message']) {
      const note = get('contact-' + name + '-error');
      note.textContent = errors[name] || '';
      note.hidden = !errors[name];
      controls[name].setAttribute('aria-invalid', errors[name] ? 'true' : 'false');
    }
  }
  function countMessage() {
    get('contact-message-count').textContent = controls.message.value.length + ' / 5000';
  }
  function resetVerification(message = '请完成验证后发送。') {
    if (state.verification === LOCAL_VERIFICATION) return refreshCaptcha();
    state.token = '';
    verificationStatus.textContent = message;
    ready();
    if (!state.widget || state.widgetId === null) return;
    try { state.widget.reset(state.widgetId); }
    catch { retry.hidden = false; verificationStatus.textContent = '验证暂时不可用，请重新检查 / 验证。'; }
  }
  function clearCaptcha() {
    win.clearTimeout(expiryTimer);
    state.token = '';
    state.expiresAt = 0;
    if (captchaAnswer) { captchaAnswer.value = ''; captchaAnswer.setAttribute('aria-invalid', 'false'); }
    if (captchaImage) { captchaImage.hidden = true; captchaImage.removeAttribute('src'); }
    if (captcha) captcha.dataset.expanded = 'false';
    if (captchaZoom) captchaZoom.setAttribute('aria-pressed', 'false');
    ready();
  }
  function expireCaptcha() {
    clearCaptcha();
    verificationStatus.textContent = '验证码已过期，请换一张后重新填写。';
  }
  async function refreshCaptcha({ focus = false } = {}) {
    if (state.busy || state.disposed || state.verification !== LOCAL_VERIFICATION) return;
    const epoch = state.epoch, challengeEpoch = ++state.challengeEpoch;
    challengeController?.abort();
    const controller = new AbortController();
    challengeController = controller;
    clearCaptcha();
    verificationStatus.textContent = '正在加载新的验证码…';
    const current = () => !state.disposed && epoch === state.epoch && challengeEpoch === state.challengeEpoch;
    try {
      const requestedAt = clock();
      const response = await request('/api/contact/challenge', { method: 'GET', cache: 'no-store', headers: { Accept: 'application/json' } }, controller);
      if (!response.ok) throw new Error('Verification unavailable');
      const challenge = await response.json();
      if (!current()) return;
      if (!validContactChallenge(challenge)) throw new Error('Verification unavailable');
      // The remaining lifetime comes from the server before HTTP delivery.
      // Start locally before the request so a delayed response cannot extend
      // it past server expiry; decoding time also stays inside this budget.
      const deadline = requestedAt + challenge.expiresInMs;
      if (deadline <= clock()) { expireCaptcha(); return; }
      const src = 'data:image/png;base64,' + challenge.image;
      await waitForCaptchaImage(src, controller);
      if (!current()) return;
      if (deadline <= clock()) { expireCaptcha(); return; }
      captchaImage.src = src;
      captchaImage.width = challenge.width;
      captchaImage.height = challenge.height;
      captchaImage.hidden = false;
      state.token = challenge.token;
      state.expiresAt = deadline;
      expiryTimer = win.setTimeout(() => { if (current()) expireCaptcha(); }, deadline - clock());
      verificationStatus.textContent = '请填写图中的六位字母或数字后发送。';
      ready();
      if (focus) captchaAnswer.focus();
    } catch {
      if (!current()) return;
      clearCaptcha();
      verificationStatus.textContent = '验证码暂时无法加载，请换一张或稍后重试。';
      retry.hidden = false;
    }
  }
  function waitForCaptchaImage(src, controller) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer = null;
      const cancelled = () => finish(new Error('Verification image unavailable'));
      const finish = (error) => {
        if (settled) return;
        settled = true;
        win.clearTimeout(timer);
        controller.signal.removeEventListener('abort', cancelled);
        if (error) reject(error);
        else resolve();
      };
      controller.signal.addEventListener('abort', cancelled, { once: true });
      if (controller.signal.aborted) { cancelled(); return; }
      timer = win.setTimeout(() => controller.abort(), 30_000);
      // Image decoding is separately bounded after fetch has completed. The
      // outer abort also releases a custom decoder that never settles.
      Promise.resolve().then(() => decodeCaptchaImage(src, { signal: controller.signal })).then(() => finish(), () => finish(new Error('Verification image unavailable')));
    });
  }
  async function request(url, options, controller) {
    const timer = win.setTimeout(() => controller.abort(), 30_000);
    try { return await fetcher(url, { ...options, credentials: 'omit', signal: controller.signal }); }
    finally { win.clearTimeout(timer); }
  }
  async function checkConfig() {
    if (state.busy || state.disposed) return;
    const epoch = ++state.epoch;
    configController?.abort();
    configController = new AbortController();
    state.enabled = false;
    state.token = '';
    challengeController?.abort();
    ++state.challengeEpoch;
    clearCaptcha();
    state.verification = null;
    if (captcha) captcha.hidden = true;
    container.hidden = true;
    ready();
    retry.hidden = true;
    tell('正在检查联系服务…');
    verificationStatus.textContent = '验证会在联系服务可用时显示。';
    if (state.widget && state.widgetId !== null) {
      try { state.widget.remove(state.widgetId); } catch { /* No provider details enter the page. */ }
      state.widgetId = null;
    }
    try {
      const response = await request('/api/contact/config', { method: 'GET', cache: 'no-store', headers: { Accept: 'application/json' } }, configController);
      if (!response.ok) throw new Error('Service unavailable');
      const config = await response.json();
      if (state.disposed || epoch !== state.epoch) return;
      if (!validContactConfig(config)) {
        tell('联系表单暂未开放，暂时无法发送。');
        retry.hidden = false;
        return;
      }
      if (config.verification === LOCAL_VERIFICATION) {
        if (!captcha || !captchaImage || !captchaAnswer || !captchaRefresh || !captchaZoom) throw new Error('Verification unavailable');
        state.verification = LOCAL_VERIFICATION;
        state.enabled = true;
        captcha.hidden = false;
        tell('填写留言并完成验证后，就可以发送。');
        await refreshCaptcha();
        return;
      }
      state.verification = 'turnstile';
      container.hidden = false;
      verificationStatus.textContent = '正在加载验证…';
      const api = await loadWidget();
      if (state.disposed || epoch !== state.epoch) return;
      state.widget = api;
      state.widgetId = api.render(container, {
        sitekey: config.siteKey, action: 'contact', theme: 'light', language: 'zh-cn',
        size: container.clientWidth > 0 && container.clientWidth < 300 ? 'compact' : 'flexible',
        'response-field': false,
        callback: (token) => {
          if (state.disposed || epoch !== state.epoch) return;
          state.token = typeof token === 'string' && token.length > 0 && token.length <= 2048 ? token : '';
          verificationStatus.textContent = state.token ? '验证已完成，可以发送留言。' : '验证未完成，请重新验证。';
          ready();
        },
        'expired-callback': () => {
          if (!state.disposed && epoch === state.epoch) resetVerification('验证已过期，请重新完成验证。');
        },
        'timeout-callback': () => {
          if (!state.disposed && epoch === state.epoch) resetVerification('验证超时，请重新完成验证。');
        },
        'error-callback': () => {
          if (state.disposed || epoch !== state.epoch) return true;
          state.token = '';
          verificationStatus.textContent = '验证暂时不可用，请重新检查 / 验证。';
          retry.hidden = false;
          ready();
          return true;
        },
      });
      if (state.widgetId === undefined || state.widgetId === null) throw new Error('Verification unavailable');
      state.enabled = true;
      verificationStatus.textContent = state.token ? '验证已完成，可以发送留言。' : '请完成验证后发送。';
      tell('填写留言并完成验证后，就可以发送。');
      ready();
    } catch {
      if (state.disposed || epoch !== state.epoch) return;
      state.enabled = false;
      state.token = '';
      tell('联系服务暂时不可用，请稍后重试。', 'error');
      verificationStatus.textContent = '验证未就绪，暂时无法发送。';
      retry.hidden = false;
      ready();
    }
  }
  async function send(event) {
    event.preventDefault();
    if (state.busy || state.disposed) return;
    if (!state.enabled || !state.token) {
      tell(state.enabled ? '请先完成验证，再发送留言。' : '联系服务尚未就绪，暂时无法发送。', 'error');
      return;
    }
    if (state.verification === LOCAL_VERIFICATION && state.expiresAt <= clock()) {
      expireCaptcha();
      tell('验证码已过期，请换一张后发送。', 'error');
      captchaRefresh.focus();
      return;
    }
    if (state.verification === LOCAL_VERIFICATION && !/^[A-Z0-9]{6}$/u.test(captchaAnswer.value)) {
      tell('请填写图中的六位字母或数字。', 'error');
      captchaAnswer.setAttribute('aria-invalid', 'true');
      captchaAnswer.focus();
      return;
    }
    const result = validateContactFields(Object.fromEntries(Object.entries(controls).map(([name, input]) => [name, input.value])));
    showErrors(result.errors);
    if (!result.valid) {
      tell('请检查填写内容，再发送。', 'error');
      controls[Object.keys(result.errors)[0]].focus();
      return;
    }
    const payload = { ...result.values, ...(state.verification === LOCAL_VERIFICATION
      ? { captchaToken: state.token, captchaAnswer: captchaAnswer.value } : { turnstileToken: state.token }) };
    sendController = new AbortController();
    busy(true);
    tell('正在发送留言…');
    try {
      const response = await request('/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload),
      }, sendController);
      if (state.disposed) return;
      if (response.status === 429) { tell('发送过于频繁，请稍后再试。', 'error'); return; }
      if (response.status === 400) {
        tell(state.verification === LOCAL_VERIFICATION
          ? '验证或填写内容未通过，请检查内容并重新填写验证码后发送。'
          : '验证或填写内容未通过，请检查内容并重新验证后发送。', 'error');
        return;
      }
      if (response.status === 403) { tell('页面来源无法验证，请刷新本站页面后重试。', 'error'); return; }
      if (!response.ok) { tell(GENERIC_FAILURE, 'error'); return; }
      const confirmed = await response.json().catch(() => null);
      if (state.disposed) return;
      if (confirmed?.ok !== true) { tell(GENERIC_FAILURE, 'error'); return; }
      form.reset();
      showErrors();
      countMessage();
      tell(CONTACT_SUCCESS, 'success');
    } catch {
      if (!state.disposed) tell(GENERIC_FAILURE, 'error');
    } finally {
      if (!state.disposed) {
        busy(false);
        await resetVerification();
      }
    }
  }
  const retryConfig = () => { void checkConfig(); };
  const inputChanged = () => { countMessage(); };
  const captchaChanged = () => {
    captchaAnswer.value = captchaAnswer.value.toUpperCase().replace(/[^A-Z0-9]/gu, '').slice(0, 6);
    captchaAnswer.setAttribute('aria-invalid', 'false');
    ready();
  };
  const refreshClicked = () => refreshCaptcha({ focus: true });
  const zoomClicked = () => {
    const expanded = captcha.dataset.expanded !== 'true';
    captcha.dataset.expanded = String(expanded);
    captchaZoom.setAttribute('aria-pressed', String(expanded));
  };
  const destroy = () => {
    state.disposed = true;
    ++state.epoch;
    ++state.challengeEpoch;
    state.token = '';
    configController?.abort();
    sendController?.abort();
    challengeController?.abort();
    clearCaptcha();
    if (state.widget && state.widgetId !== null) {
      try { state.widget.remove(state.widgetId); } catch { /* No provider details enter the page. */ }
    }
    ready();
    form.removeEventListener('submit', send);
    controls.message.removeEventListener('input', inputChanged);
    retry.removeEventListener('click', retryConfig);
    captchaAnswer?.removeEventListener('input', captchaChanged);
    captchaRefresh?.removeEventListener('click', refreshClicked);
    captchaZoom?.removeEventListener('click', zoomClicked);
  };
  form.addEventListener('submit', send);
  controls.message.addEventListener('input', inputChanged);
  retry.addEventListener('click', retryConfig);
  captchaAnswer?.addEventListener('input', captchaChanged);
  captchaRefresh?.addEventListener('click', refreshClicked);
  captchaZoom?.addEventListener('click', zoomClicked);
  win.addEventListener('pagehide', destroy, { once: true });
  win.addEventListener('pageshow', (event) => { if (event.persisted) win.location.reload(); });
  countMessage();
  return { ready: checkConfig(), destroy };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const start = () => initContactForm({ doc: document, win: window, fetcher: window.fetch.bind(window) });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
