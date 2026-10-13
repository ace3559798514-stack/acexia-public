# ACE 的空间 · 公共展示片段

这是 ACE 的空间的公共前端展示包，包含共享导航、首页入口插画及联系表单界面。它不是完整站点，也无法运行正式站点的游戏、雷达、通信、文件或设备功能。核心业务实现保留在私有仓库。

公共仓库地址：[acexia-public](https://github.com/ace3559798514-stack/acexia-public)。正式站点：[ACE 的空间](https://acexia.xyz/)。

## 内容

- `shared/site-shell.mjs`、`shared/site-shell.css`：静态共享导航与页面外框。
- `shared/home-destinations.mjs`：公开首页入口卡片及内嵌 SVG 插画。
- `about/index.html`、`contact.css`、`contact.js`：关于页与联系表单前端。
- `index.html`：通用导航与卡片展示。
- `preview.mjs`：仅使用 Node.js 内置模块的本地静态预览。

本包由明确的文件白名单导出，没有附带原仓库历史、运行数据或完整站点实现。

## 本地预览

需要支持 ES Modules 与原生 `fetch` 的现代 Node.js。无需安装依赖。

```sh
node preview.mjs
```

打开终端显示的本地地址。默认端口是 `4173`；也可以指定端口：

```sh
node preview.mjs 4180
```

预览只监听本机地址。关于页地址为 `/about/`；`/play/`、`/radar/`、`/learn/`、`/community/`、`/friends/`、`/connect/`、`/connect/mailbox/`、`/files/`、`/companion/` 和 `/support/` 仅展示共享页头的当前入口状态，不会启动业务功能。

## 同步来源与候选状态

本次界面片段同步于 2026-10-13，来源版本为 `09f7057a751f30c086427db639f7a454148f9cb3`（网站 PR #23 的候选界面）。新增公益课堂、作品社区与好友导航，以及公益课堂入口插画。

这些导航展示候选界面，不代表对应业务已全部上线：2026-10-13 核对时，正式站点的作品社区入口尚未上线。本地预览中的业务页面只显示导航状态，不能发布分享、登录账号或读取正式站点数据。

## 联系表单依赖

联系表单只请求当前页面的同源公开接口。正式站点目前使用本站图片验证码：

- `GET /api/contact/config`：本地验证码配置为 `{ enabled: boolean, verification: 'local-captcha-v1', siteKey: '' }`。
- `GET /api/contact/challenge`：返回 `{ token, image, width, height, expiresAt, expiresInMs }`；`image` 为 PNG 的 base64 图片，用户填写图中的六位字母或数字。
- `POST /api/contact`：发送 `{ name, email, message, website, captchaToken, captchaAnswer }`。

名字、回复邮箱及留言由访问者填写；`website` 为不可见的防垃圾字段。验证码刷新、图片加载或网络延迟不会延长服务端有效期。只有服务端返回成功确认 `{ ok: true }` 时才显示“已收到，会尽快回复”。

前端保留旧部署的 Turnstile 兼容模式：当配置没有 `verification`、但提供非空 `siteKey` 时，才加载 Cloudflare 官方 explicit Turnstile API，并改用 `turnstileToken` 提交验证结果。本站图片验证码模式不加载该第三方验证组件。

本地预览没有以上 API，GET 请求返回 404，POST 请求返回 405；联系表单明确显示服务不可用并保持禁止发送。预览不代理正式 API、不模拟验证成功，也不会把留言跨源发到正式站点。实际发送依赖所在站点的同源后端，不能通过这个展示包单独完成。

## 版权

Copyright (c) 2026 ACE. All rights reserved.

公开展示不授予复制、修改、再分发或商业使用许可。授权事项请通过正式站点的联系表单沟通。
