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

预览只监听本机地址。导航入口用于展示共享页头的状态，各业务入口不会启动正式功能。关于页地址为 `/about/`。

## 联系表单依赖

联系表单使用同源公开接口：

- `GET /api/contact/config`：公开配置，响应为 `{ enabled: boolean, siteKey: string }`（未配置时为空字符串）。
- `POST /api/contact`：发送 `{ name, email, message, website, turnstileToken }`。

名字、回复邮箱及留言由访问者填写；`website` 为不可见的防垃圾字段。表单通过 Cloudflare 官方 explicit Turnstile API 完成验证，只有服务端返回成功确认 `{ ok: true }` 时才显示“已收到，会尽快回复”。

本地预览没有这些接口，因此联系表单会明确显示服务不可用并保持禁止发送。实际发送依赖正式站点的同源服务和有效验证配置，不能通过这个展示包单独完成。

## 版权

Copyright (c) 2026 ACE. All rights reserved.

公开展示不授予复制、修改、再分发或商业使用许可。授权事项请通过正式站点的联系表单沟通。
