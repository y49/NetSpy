# NetSpy

A Chrome DevTools extension for inspecting, intercepting, and modifying network requests.

一个用于检查、拦截和修改网络请求的 Chrome DevTools 扩展。

![Chrome Extension](https://img.shields.io/badge/Chrome-MV3-blue) ![Version](https://img.shields.io/badge/version-1.4.0-green) [![License: MIT](https://img.shields.io/badge/license-MIT-brightgreen)](LICENSE)

## Features / 功能

### Request Inspection / 请求检查
- Real-time network request monitoring / 实时网络请求监控
- Detailed view of headers, body, cookies, and timing / 详细查看请求头、请求体、Cookie 和耗时
- Filter by protocol (HTTP/HTTPS), content type, and status code / 按协议、内容类型、状态码过滤
- Search requests by URL or content / 按 URL 或内容搜索请求
- Group requests by domain / 按域名分组

### Request Interception / 请求拦截
- **Request Mode** — Intercept and modify outgoing requests / 拦截并修改发出的请求
- **Response Mode** — Intercept and modify server responses / 拦截并修改服务器响应
- **Both Mode** — Intercept at both stages / 同时拦截请求和响应
- Mock responses with custom status codes, headers, and body / 自定义 Mock 响应

### Polling Strategies / 轮询策略

Handle polling/repeated requests with configurable strategies:

处理轮询/重复请求的可配置策略：

| Strategy / 策略 | Behavior / 行为 |
|----------|----------|
| Keep Latest / 保留最新 | Release old request, keep newest / 释放旧请求，保留最新 |
| Block Old / 阻止旧请求 | Block old request, keep newest / 阻止旧请求，保留最新 |
| Block All / 全部阻止 | Block all duplicate URL requests / 阻止所有重复 URL 请求 |
| Keep All / 全部保留 | Keep all, handle manually / 全部保留，手动处理 |
| Queue / 队列 | Queue mode, wait for previous to complete / 队列模式，等待上一个完成 |

### Request Editing & Resending / 请求编辑与重发
- Modify URL, method, headers, and body before resending / 重发前可修改 URL、方法、请求头和请求体
- Bidirectional URL ↔ query params sync / URL 与查询参数双向同步
- Support for form-data, x-www-form-urlencoded, raw, and JSON body types / 支持多种请求体格式
- Body data preserved when switching body types / 切换请求体类型时保留数据
- Input validation for URL, JSON, headers, and status codes / URL、JSON、请求头、状态码输入校验

### Collections / 集合
- Organize requests into collections / 将请求整理为集合
- Export/import collections as JSON / 导出/导入 JSON 格式集合

## Installation / 安装

### From Source / 从源码安装

```bash
git clone https://github.com/y49/NetSpy.git
cd NetSpy
npm install
npm run build
```

Load in Chrome / 在 Chrome 中加载：
1. Open `chrome://extensions/` / 打开 `chrome://extensions/`
2. Enable **Developer mode** / 启用**开发者模式**
3. Click **Load unpacked** / 点击**加载已解压的扩展程序**
4. Select the `dist` folder (production) or project root (development) / 选择 `dist` 目录（生产）或项目根目录（开发）

### Development / 开发

```bash
# Build (no minification) / 构建（不压缩）
npm run build

# Build for production (minified, console stripped) / 生产构建（压缩，移除日志）
npm run build:prod
```

## Usage / 使用

1. Open Chrome DevTools (`F12`) / 打开 Chrome 开发者工具
2. Navigate to the **NetSpy** tab / 切换到 **NetSpy** 标签页

### Intercepting Requests / 拦截请求
1. Toggle the **Intercept** switch / 开启**拦截**开关
2. Select mode: Request / Response / Both / 选择模式：请求 / 响应 / 两者
3. Enter URL pattern (e.g., `*api*` or `*`) / 输入 URL 匹配模式
4. Choose polling strategy / 选择轮询策略
5. Interact with the page to capture requests / 操作页面触发请求捕获
6. Edit and forward modified requests/responses / 编辑并转发修改后的请求/响应

### Filtering Requests / 过滤请求
- Protocol: All / HTTP / HTTPS / 协议过滤
- Type: API, JSON, XML, HTML, JS, CSS, Image / 类型过滤
- Status: 1xx, 2xx, 3xx, 4xx, 5xx / 状态码过滤
- Search box for URL matching / 搜索框匹配 URL

## Security & Permissions / 安全与权限

NetSpy requires the following Chrome permissions:

NetSpy 需要以下 Chrome 权限：

| Permission / 权限 | Reason / 原因 |
|------------|--------|
| `debugger` | Core functionality: uses Chrome DevTools Protocol (Fetch domain) to intercept and modify network requests / 核心功能：使用 CDP Fetch 域拦截和修改网络请求 |
| `webRequest` | Monitor network request lifecycle events / 监控网络请求生命周期事件 |
| `storage` | Persist user settings and collections / 持久化用户设置和集合 |
| `notifications` | Alert users about interception status / 通知用户拦截状态 |
| `<all_urls>` | Required for intercepting requests to any domain. The extension only activates when the user explicitly enables interception with a URL pattern. / 拦截任意域名的请求所需。仅在用户明确开启拦截并设置 URL 模式时激活。 |

**Privacy**: NetSpy runs entirely locally. No data is sent to external servers. All captured request data stays in your browser.

**隐私**：NetSpy 完全在本地运行，不会向外部服务器发送任何数据。所有捕获的请求数据保留在浏览器中。

## Architecture / 架构

```
NetSpy/
├── background.js          # Service worker (InterceptionManager)
├── panel.html             # DevTools panel UI
├── manifest.json          # Chrome MV3 manifest
├── build.js               # Build script (Terser + CleanCSS)
├── styles/                # Modular CSS (12 files)
│   ├── variables.css      # CSS variables & theme
│   ├── base.css           # Reset & base styles
│   ├── toolbar.css
│   ├── layout.css
│   ├── request-table.css
│   ├── detail-panel.css
│   ├── kv-editor.css
│   ├── body-editor.css
│   ├── intercept.css
│   ├── buttons.css
│   ├── json-viewer.css
│   └── media-preview.css
├── js/
│   ├── main.js            # Panel entry point
│   ├── utils.js           # Shared utilities
│   ├── utils/
│   │   ├── encoding.js    # Base64/UTF-8 encoding
│   │   └── validators.js  # Input validation
│   ├── core/
│   │   ├── store.js       # State management
│   │   ├── constants.js   # Shared constants
│   │   ├── eventBus.js    # Event system
│   │   └── requestModel.js
│   ├── services/
│   │   ├── captureService.js
│   │   ├── interceptService.js
│   │   └── requestService.js
│   └── ui/
│       ├── toolbar.js
│       ├── requestList.js
│       ├── detailPanel.js
│       └── responseViewer.js
└── icons/
```

## Contributing / 贡献

Contributions are welcome! Please feel free to open issues or submit pull requests.

欢迎贡献！请随时提交 Issue 或 Pull Request。

1. Fork the repository / Fork 本仓库
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request / 提交 Pull Request

## License / 许可证

[MIT](LICENSE)
