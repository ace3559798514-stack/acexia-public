const primaryDestinations = Object.freeze([
  { key: 'play', href: '/play/', label: '一起玩' },
  { key: 'radar', href: '/radar/', label: '折扣雷达' },
  { key: 'connect', href: '/connect/', label: '通话与信箱' },
  { key: 'files', href: '/files/', label: '文件传输' },
  { key: 'companion', href: '/companion/', label: '设备中心' },
  { key: 'support', href: '/support/', label: '支持与隐私' },
  { key: 'about', href: '/about/', label: '关于 / 联系我' },
]);

const communicationDestinations = Object.freeze([
  { key: 'call', href: '/connect/', label: '私密通话', description: '两人同时在线' },
  { key: 'mailbox', href: '/connect/mailbox/', label: '声音信箱', description: '异步留言' },
]);

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function primaryActive(active) {
  if (active === 'call' || active === 'mailbox') return 'connect';
  if (active === 'wifi') return 'companion';
  return ['home', ...primaryDestinations.map(({ key }) => key)].includes(active) ? active : '';
}

/**
 * Static site navigation. accountMarkup is a trusted, build-owned HTML slot:
 * pass the existing account control with its original app IDs and handlers.
 * No identity, network, or authentication behavior belongs in this helper.
 */
export function renderSiteHeader({ active, accountMarkup = '' } = {}) {
  const current = primaryActive(active);
  const account = typeof accountMarkup === 'string' ? accountMarkup : '';
  const links = primaryDestinations.map(({ key, href, label }) =>
    `<li class="ace-primary-nav__item"><a class="ace-primary-link" href="${escapeHtml(href)}"${current === key ? ' aria-current="page"' : ''}>${escapeHtml(label)}</a></li>`
  ).join('\n        ');

  return `<header class="ace-site-header" data-ace-site-header>
  <div class="ace-site-header__inner">
    <a class="ace-site-brand" href="/" aria-label="ACE 的空间首页"${current === 'home' ? ' aria-current="page"' : ''}><span class="ace-site-brand__mark" aria-hidden="true">✦</span><span class="ace-site-brand__name">ACE 的空间</span></a>
    <nav class="ace-primary-nav" aria-label="快速导航">
      <ul class="ace-primary-nav__list">
        ${links}
      </ul>
    </nav>${account ? '\n    <div class="ace-site-account">' + account + '</div>' : ''}
  </div>
</header>`;
}

/** Place directly after the shared header, before the page's main container. */
export function renderCommunicationNav({ active } = {}) {
  const current = active === 'connect' ? 'call' : active;
  const links = communicationDestinations.map(({ key, href, label, description }) =>
    `<a class="ace-communication-tab" href="${escapeHtml(href)}"${current === key ? ' aria-current="page"' : ''}><span class="ace-communication-tab__label">${escapeHtml(label)}</span><span class="ace-communication-tab__description">${escapeHtml(description)}</span></a>`
  ).join('\n    ');

  return `<nav class="ace-communication-nav" aria-label="通话与信箱">
  <div class="ace-communication-nav__inner">
    ${links}
  </div>
</nav>`;
}
