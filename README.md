# NetSpy

A Chrome DevTools extension for inspecting, intercepting, and modifying network requests.

一个用于检查、拦截和修改网络请求的 Chrome DevTools 扩展。

![Chrome Extension](https://img.shields.io/badge/Chrome-MV3-blue) ![Version](https://img.shields.io/badge/version-1.3.0-green) ![License](https://img.shields.io/badge/license-MIT-brightgreen)

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

# Build for production (minified) / 生产构建（压缩）
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

## Architecture / 架构

```
NetSpy/
├── background.js          # Service worker (InterceptionManager)
├── panel.html             # DevTools panel UI
├── manifest.json          # Chrome MV3 manifest
├── build.js               # Build script (Terser + CleanCSS)
├── styles/                # Modular CSS (12 files) / 模块化样式
│   ├── variables.css      # CSS variables & theme / 变量与主题
│   ├── base.css           # Reset & base styles / 基础样式
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
│   ├── main.js            # Panel entry point / 面板入口
│   ├── utils.js           # Shared utilities / 公共工具
│   ├── utils/
│   │   ├── encoding.js    # Base64/UTF-8 encoding / 编码工具
│   │   └── validators.js  # Input validation / 输入校验
│   ├── core/
│   │   ├── store.js       # State management / 状态管理
│   │   ├── constants.js   # Shared constants / 共享常量
│   │   ├── eventBus.js    # Event system / 事件系统
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

## License / 许可证

MIT
