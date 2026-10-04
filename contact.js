export const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
export const CONTACT_SUCCESS = '已收到，会尽快回复';
const GENERIC_FAILURE = '暂时无法发送，请稍后重试。';

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
  return !!value && value.enabled === true && typeof value.siteKey === 'string'
    && /^[A-Za-z0-9_-]{3,100}$/u.test(value.siteKey);
}

export function loadTurnstile(win, doc) {
  if (win.turnstile && typeof win.turnstile.render === 'function') return Promise.resolve(win.turnstile);
  return new Promise((resolve, reject) => {
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
    script.defer = true;
    script.onload = () => {
      const api = win.turnstile;
      if (!api || typeof api.render !== 'function') { finish(new Error('Verification unavailable')); return; }
      if (typeof api.ready === 'function') api.ready(() => finish());
      else finish();
    };
    script.onerror = () => finish(new Error('Verification unavailable'));
    doc.head.append(script);
  });
}

export function initContactForm({ doc, win, fetcher, loadWidget = () => loadTurnstile(win, doc) }) {
  const get = (id) => doc.getElementById(id);
  const form = get('contact-form');
  if (!form) return null;
  const fields = get('contact-fields');
  const submit = get('contact-submit');
  const retry = get('contact-retry');
  const status = get('contact-status');
  const verificationStatus = get('contact-verification-status');
  const container = get('contact-turnstile');
  const controls = { name: get('contact-name'), email: get('contact-email'), message: get('contact-message'), website: get('contact-website') };
  const state = { enabled: false, busy: false, token: '', widget: null, widgetId: null, disposed: false, epoch: 0 };
  let configController;
  let sendController;
  function tell(message, phase = '') {
    status.textContent = message;
    status.dataset.state = phase;
  }
  function ready() {
    submit.disabled = !state.enabled || !state.token || state.busy || state.disposed;
    retry.disabled = state.busy;
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
    state.token = '';
    verificationStatus.textContent = message;
    ready();
    if (!state.widget || state.widgetId === null) return;
    try { state.widget.reset(state.widgetId); }
    catch { retry.hidden = false; verificationStatus.textContent = '验证暂时不可用，请重新检查 / 验证。'; }
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
    const result = validateContactFields(Object.fromEntries(Object.entries(controls).map(([name, input]) => [name, input.value])));
    showErrors(result.errors);
    if (!result.valid) {
      tell('请检查填写内容，再发送。', 'error');
      controls[Object.keys(result.errors)[0]].focus();
      return;
    }
    const payload = { ...result.values, turnstileToken: state.token };
    sendController = new AbortController();
    busy(true);
    tell('正在发送留言…');
    try {
      const response = await request('/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload),
      }, sendController);
      if (state.disposed) return;
      if (response.status === 429) { tell('发送过于频繁，请稍后再试。', 'error'); return; }
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
        resetVerification();
      }
    }
  }
  const retryConfig = () => { void checkConfig(); };
  const inputChanged = () => { countMessage(); };
  const destroy = () => {
    state.disposed = true;
    ++state.epoch;
    state.token = '';
    configController?.abort();
    sendController?.abort();
    if (state.widget && state.widgetId !== null) {
      try { state.widget.remove(state.widgetId); } catch { /* No provider details enter the page. */ }
    }
    ready();
    form.removeEventListener('submit', send);
    controls.message.removeEventListener('input', inputChanged);
    retry.removeEventListener('click', retryConfig);
  };
  form.addEventListener('submit', send);
  controls.message.addEventListener('input', inputChanged);
  retry.addEventListener('click', retryConfig);
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
