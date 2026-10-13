<div align="center">

# Portfolio Studio · 个人作品集工作台

**可自托管、内容驱动的个人站点 + 后台编辑工作台。**
本地优先 SQLite、Cloudflare R2 异地镜像、MDX 内容层、MongoDB 备份，
以及面向非工程师的硬化后台 GUI。

English → [README.md](./README.md)

[![Repo](https://img.shields.io/badge/GitHub-hiko--server%2Flanding__page-181717?logo=github)](https://github.com/hiko-server/landing_page)
[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Chakra UI](https://img.shields.io/badge/Chakra_UI-2.8-319795?logo=chakraui)](https://chakra-ui.com/)
[![SQLite](https://img.shields.io/badge/Storage-SQLite-003B57?logo=sqlite)](https://www.sqlite.org/)
[![Cloudflare R2](https://img.shields.io/badge/Mirror-R2-f38020?logo=cloudflare)](https://developers.cloudflare.com/r2/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

<img src="docs/screenshots/hero-light.png" alt="浅色模式首页" width="900" />

</div>

---

## 项目亮点

- **本地优先内容存储**：`data/content.db` 中的 SQLite 是真源；Cloudflare R2
  作为异地镜像；文件系统中的 MDX/JSON 仅作单向种子。每次后台写入都会
  **同步**落 DB，并**尽力**同步推 R2。
- **一键全站快照**：`lib/backup.ts` 把 SQLite（通过 SQLite Online Backup
  API，WAL 一致）、上传图片、版本历史快照和管理员/Mongo 配置打成单个
  gzip tarball；后台提供「立即备份」「拉取最新」两枚按钮。
- **MDX 内容层**：`/blog`、`/work`（案例研究）、`/now`、`/uses` 全部由
  类型化 MDX 集合驱动，在服务端编译（浏览器里不再 `eval`），配品牌字体的
  社交卡片与全文订阅源。
- **双语 CV**：英文在 `/cv`，中文在 `/cv/zh`（旧地址 `/cv?lang=zh` 以 308
  跳转），支持 `?print=1`；日期与标签按语言格式化，A4 打印 / PDF 每页都有
  真实页边距，并带滚动版本历史。
- **CV Studio：每一层都能隐藏 / 显示**——任意**板块**（CV/PDF 与网站分开控制）、
  任意**条目**（一段学历、一份工作、一条亮点）、任意**字段**（GPA、电话……）以及
  任意**单条要点或标签**，点眼睛图标即可。被隐藏的内容会在服务端从所有公开页面和
  公开 API 中**彻底移除**，而不只是视觉上隐藏。EN ↔ 中 联动编辑（可见性与结构保持一致）、
  两种语言共用一套撤销历史、拖拽排序、自适应宽度的 A4 实时预览（含分页参考线）、
  本地草稿恢复与覆盖保护。
- **面向非工程师的后台**：可视化编辑 Hero、品牌、社交、照片墙、博客、
  案例研究、CV（Studio + 原始 JSON），以及 Now/Uses。
- **逐节可见性开关**：首页所有 `[NN]` 板块（Open Source / Tech Stack /
  Activity / Projects / Experience / Certs / Photos / Contact）都可
  从后台直接隐藏，无需改代码。
- **联系面板可编辑**：标题、眉标、副标语、原因下拉项均来自
  `data/home.json`；留空时回退到内置默认值。
- **后台收件箱**：联系表单的每条留言都会连同是否已发出邮件一起保存，
  即使没有配置 SMTP，也能在后台阅读并回复。
- **工业级后台认证**：scrypt + 16 字节随机盐；按（邮箱，IP）锁定，遭受攻击时
  全站限制尝试速率；按 IP 限流；`httpOnly` + `SameSite=Strict`
  + `Secure` Cookie；通过 `jose` 在 Edge Middleware 校验 JWT，未登录
  访客**完全无法看到**任何 admin 页面；统一下发 HSTS / CSP / X-Frame /
  X-Robots。

<table>
<tr>
<td><img src="docs/screenshots/admin-home.png" alt="后台 Home 编辑器" /></td>
<td><img src="docs/screenshots/admin-storage.png" alt="存储与备份面板" /></td>
</tr>
<tr>
<td align="center"><sub>后台 → Home：可见性开关 + 内容字段</sub></td>
<td align="center"><sub>后台 → Storage：本地 SQLite + R2 镜像 + tarball 快照</sub></td>
</tr>
</table>

---

## 本次发布的新功能

**面向访客**

- **Geist 字体**（无衬线、等宽、可变斜体），本地托管（OFL 协议）；原先预加载
  的 780 KB Inter / JetBrains Mono 已移除。
- **中文 CV 拥有独立地址** `/cv/zh`：`lang="zh-Hans"`，中文标题、描述、社交
  卡片与 JSON-LD；`/cv?lang=zh|cn` 以 308 跳转并保留 `print=1`。每个条目都有
  稳定锚点（`#cv-<板块>-<序号>`），打印版附带指向在线 CV 的二维码。
- **`/colophon`**：本站如何构建——技术栈、字体、托管方式、隐私模型、更新日志
  和当前部署的提交。
- **首页**：预先生成的响应式 Hero 图、逐词浮现的标题、随光标点亮的卡片边框、
  随滚动填充的经历时间轴、取自 CV 的技能、「写作与案例」板块，以及带共享元素
  灯箱的全宽 Field Notes 照片带。GitHub 数据（站长精选仓库、有意义的统计、
  靛蓝色贡献图）直接渲染进 HTML。
- **联系页**：可用状态卡片（仅当站长设置时显示）、复制按钮、vCard
  （`/api/vcard`）及用于保存联系人的二维码。
- **文章**：GitHub 风格 Markdown、零布局偏移且带 `srcset` 与点按放大的图片、
  YouTube 与 Figure 组件、案例封面、标题锚点和目录。
- **可发现性**：标题带上站长姓名，ProfilePage / Person JSON-LD，品牌字体的
  社交卡片，以及全文订阅源：`/feed.xml`（RSS，逐条标注语言）、
  `/work/feed.xml`、`/feed.json`，列在页脚「This site」一栏，与技术说明和隐私说明并列。
- **命令面板 3.0**（⌘K / `/`）：按需加载，通过 `/api/search-index` 全文搜索；
  站长登录后多出「Admin」分组，含随当前页面变化的「编辑此页」。面板里的
  「Keyboard shortcuts: on/off」（后台 `?` 面板里也有）可按浏览器关闭单键快捷键
  （`/`、`G` 加字母）。
- **主题**：跟随系统 / 浅色 / 深色。顶栏一键切换，旁边的菜单（以及 ⌘K）可选
  三种偏好；默认深色（`NEXT_PUBLIC_DEFAULT_THEME`），在首帧绘制前生效，任何
  页面都不会闪错颜色；选「跟随系统」时随操作系统切换。
- **设计系统**：流式字号、文本样式、圆角、容器宽度，以及一条缓动曲线加三档
  时长，统一为令牌（`theme/tokens.ts`）；带突破线的页面网格、状态与阴影颜色
  令牌，公开页面统一使用按 4 px 网格取尺寸的 Lucide 图标；合作 Logo 在保存时
  自动测量并按视觉面积均衡显示。
- **克制的动效**：从切换按钮展开的圆形主题过渡、带方向的路由过渡与固定的
  顶栏；`prefers-reduced-motion` 下全部关闭，装饰性表面都提供
  `forced-colors` 回退。

**面向站长**

- `/admin` **状态中心**：未读留言、草稿、备份时长、待同步的 R2 写入、缺失的
  配置，每项都附带操作入口。
- **编辑永不丢失**：文章、案例、`/now`、`/uses` 与首页编辑器都有本地草稿恢复和
  `If-Match` 冲突检查（弹出「Changed elsewhere」对话框，而不是静默覆盖）。
- 文章、案例与页面的**历史记录、最近删除与撤销删除**。
- **编译校验后再发布**：MDX 错误在保存前就带行列号报告；「Publish…」会运行
  发布前检查清单（标题与描述长度、图片替代文本、外链图片、失效的站内链接）；
  左右分栏实时预览使用真实渲染器，并可在真实 URL 上以 Draft Mode 预览。
- **富文本编辑器**：斜杠命令菜单，以及链接与图片替代文本的气泡菜单。
- **无需按请求优化的图片流水线**：上传时生成 WebP 尺寸变体并记录宽高（已有
  上传可补生成），外链图片可一键经防 SSRF 的抓取器导入。
- **首页编辑器**：照片 / Logo / 链接卡片可排序（鼠标、触控、键盘），可用状态、
  精选仓库、Logo 缩放、站点名称。
- **更安全的导航**：用「保存并离开 / 放弃 / 留下」对话框取代浏览器确认框，
  相对时间的保存状态（"Saved · 12 s ago"），所有后台页面按 `?` 打开快捷键面板。
- **Analytics 标签页**：第一方、无 Cookie 的访问统计与真实用户 Core Web Vitals
  （见[隐私](#隐私第一方访问统计)）。
- **定时备份**：每隔 `BACKUP_INTERVAL_HOURS`（默认 24）在内容有变化时生成全站
  快照，备份时长显示在 Storage 面板与 `/api/health` 的详情中（仅管理员或持有
  `HEALTH_TOKEN` 的请求可见）。
- **可运维性**：带请求 ID 的结构化 JSON 日志（`LOG_LEVEL`），按页面区域划分的
  错误边界。

**安全与交付**

- Next.js 16.3（以 webpack 构建）；图片优化器已禁用（`/_next/image` 返回 404 —
  GHSA-2xp9-vwfh-vxw4）；生产环境 CSP 不含 `'unsafe-eval'`。
- 中间件对公开域名做 HTTP → HTTPS（308）跳转并处理旧 CV 地址；服务端抓取由
  内容或后台提供的 URL 时一律经过 `lib/security/safeFetch.ts`。
- 服务器上的 compose 覆盖文件不再纳入版本库（提供只绑定回环地址的示例），
  容器日志轮转，基础镜像按 digest 固定，发布镜像只包含追踪出的运行时文件。
- CI 关卡：阻断式生产依赖审计（带到期日的豁免清单）、性能预算，以及针对同一
  Docker 镜像运行的 Playwright + axe 端到端测试。
- [`scripts/deploy.sh`](#部署到生产环境)：带健康检查、备份与自动回滚的部署。
- [版本化的 Cloudflare 配置](#cloudflare)，以及每次重新生成页面时按环境变量
  启用的缓存清除与 IndexNow 推送。

---

## 技术栈

| 层 | 选型 | 取舍说明 |
|---|---|---|
| 框架 | **Next.js 16（Pages Router，webpack 构建）** + **React 18** | 成熟的 SSR/ISR、文件式 API、Edge Middleware |
| UI | **Chakra UI 2** | 可组合原语，开箱即用的深色模式 |
| 动效 | **Framer Motion** | Hero 入场、分节 reveal |
| 内容存储 | **better-sqlite3** + **Cloudflare R2** | 本地优先 + 廉价异地副本 |
| 写作 | **MDX**（`unified`：remark-parse、remark-mdx、remark-gfm、remark-rehype + `rehype-pretty-code`） | 服务端编译成 HAST 树，渲染时不 `eval` |
| 字体 | **Geist / Geist Mono**（本地托管，OFL） | 一套可变字体覆盖界面、正文与代码 |
| 备份 tarball | **`tar-stream` + `node:zlib`** | 单文件原子快照 |
| 备份目标（可选） | **MongoDB GridFS** | 已配置时镜像图片 + JSON |
| 邮件 | **Nodemailer** | 联系表单 + 密码重置 |
| 鉴权 | **scrypt + `jsonwebtoken` + `jose`（Edge）** | 锁定感知登录、Edge JWT 校验 |
| 编辑器 | **TipTap**（富文本） + 类 Monaco JSON | 文章块编辑器 + 原始 JSON CV |
| 图片 | **sharp**（上传时处理） | WebP 尺寸变体 + 宽高；不做按请求优化 |
| 测试 | **node:test**、**Playwright** + **axe-core** | 单元测试、浏览器端到端测试与 CI 中的 WCAG 2.2 AA 检查 |

---

## 目录结构

```
.
├── components/          # UI 原子 / 分子 / 组织级组件
│   ├── Admin/           # HomeEditor / CVEditorStudio / StoragePanel …
│   ├── LandingPage/     # PersonalInfo / Content / ExperienceTimeline …
│   └── …
├── content/             # MDX 种子（首次读取时单向 → DB）
│   ├── blog/*.mdx
│   ├── work/*.mdx
│   ├── now.mdx
│   └── uses.mdx
├── data/                # 运行时状态 — 已 .gitignore
│   ├── content.db       # SQLite 真源
│   ├── home.json        # Hero / 社交 / 品牌 / 照片墙的 KV 种子
│   ├── cvdata.json      # CV en/zh 真源
│   ├── admin.json       # 本地管理员记录（hash + salt）
│   ├── *_snapshots/     # 每类内容的版本历史
│   └── backups/         # snapshot-<UTC>.tgz
├── lib/                 # 服务端工具库
│   ├── backup.ts        # 快照打包 / 解包流水线
│   ├── admin.ts         # scrypt + 锁定感知验证
│   ├── home.ts          # HomeData schema + 分节键
│   ├── currentlyCoding.ts # 从 CV 推导芯片内容
│   ├── db.ts / r2.ts / contentStore.ts
│   └── env.ts / rateLimit.ts / mailer.ts
├── pages/
│   ├── api/             # 全部服务端接口
│   │   ├── admin/       # 需鉴权：storage / posts / work / page …
│   │   ├── auth/        # email-login / request-reset / reset-password
│   │   ├── contact*     # 联系表单 + nonce
│   │   └── home / cvdata / mongo / og …
│   ├── admin/           # 需鉴权 UI：dashboard / login / forgot / reset …
│   ├── blog/ / work/ / now / uses / about / cv …
│   └── index.tsx
├── scripts/             # CLI：内容 migrate / push / pull / list，
│                        # deploy.sh、cloudflare-config、check-audit、perf-budget
├── e2e/                 # Playwright + axe 端到端测试
├── security/            # audit-allowlist.json（已审阅、带到期日的豁免）
├── tests/               # node:test 单元测试
├── middleware.ts        # Edge 跳转、安全响应头、CSRF、后台鉴权门
└── public/              # 静态资源
```

---

## 快速开始

### 1. 拉取与安装

```bash
git clone https://github.com/hiko-server/landing_page.git
cd landing_page
yarn          # 或 npm install / pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env — 至少设置 ADMIN_EMAIL / ADMIN_PASS / JWT_SECRET
# JWT_SECRET 可用：
# node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3. 初次本地种子

```bash
yarn content:migrate    # 把 content/*.mdx + data/*.json 写入 data/content.db
```

### 4. 开发模式

```bash
yarn dev                # localhost:3002（或 PORT 环境变量）
```

访问：
- `/` — 首页
- `/admin/login` — 后台入口（**隐蔽**：导航中**故意**不放可见链接）

### 5. 生产模式

```bash
yarn build && yarn start
```

或使用 Docker（服务器覆盖文件见 [Docker](#docker)）：

```bash
cp docker-compose.override.example.yml docker-compose.override.yml   # 仅需一次
docker compose up -d --build
```

---

## 环境变量

完整说明见 [`.env.example`](./.env.example)。重点：

| 分组 | 变量 | 是否必填 |
|---|---|---|
| 管理员引导 | `ADMIN_EMAIL`、`ADMIN_PASS` | ✅ 仅首次启动；落盘后可删 |
| 会话 | `JWT_SECRET`（base64，≥ 32 字节） | ✅ 始终必填 |
| 站点身份 | `NEXT_PUBLIC_PRODUCT_NAME`、`NEXT_PUBLIC_SITE_HOST`、`SITE_URL` | 推荐填 |
| 默认主题 | `NEXT_PUBLIC_DEFAULT_THEME`（留空为 `dark`，可选 `light` 或 `system`；构建时生效） | 可选 |
| 邮件 | `SMTP_HOST/PORT/USER/PASS`、`FROM_EMAIL`、`NOTIFY_EMAIL` | 可选 — 未设置时静默跳过 |
| 联系验证码 | 无 — 内置 nonce + 数学题 + 蜜罐 | 不适用 |
| GitHub | `GITHUB_TOKEN`（细粒度令牌，仅公开仓库只读，不授予任何权限） | 推荐（API 限额 60 → 5000/h） |
| MongoDB 备份 | `MONGODB_URI`、`MONGODB_DB_NAME` | 可选 |
| Cloudflare R2 | `R2_ENDPOINT`、`R2_BUCKET`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_REQUIRED` | 可选 |
| 定时备份 | `BACKUP_INTERVAL_HOURS`（默认 24，`0` 关闭） | 可选 |
| 日志 | `LOG_LEVEL`（`debug` / `info` / `warn` / `error`） | 可选 |
| Cloudflare 缓存清除 | `CF_ZONE_ID`、`CF_API_TOKEN` | 可选 — 两者都设置才会发送 |
| IndexNow | `INDEXNOW_KEY`（8–128 位 `[A-Za-z0-9-]`） | 可选 — 未设置即关闭 |
| 健康详情 | `HEALTH_TOKEN`（供监控使用的 Bearer 令牌） | 可选 — 未设置时只有已登录的管理员能看到 `/api/health` 详情 |
| 后台二次验证 | `ADMIN_RECENT_AUTH_MINUTES`（1–60，默认 10） | 可选 |
| 恢复演练 | `RESTORE_DRILL_INTERVAL_HOURS`（默认 168，`0` 关闭） | 可选 |

> 仓库里**永远不会**提交真实 `.env`。`.env.example` 仅含占位值 — 拷贝
> 一份再按自己的部署填即可。

---

## 架构

### 内容存储（本地优先）

```
                ┌─────────────┐
   后台 GUI  ──▶│ /api/home   │──┐
                │ /api/admin/*│  │
                └─────────────┘  │ 双写
                                 ▼
            ┌──────────────────────────────┐
            │ SQLite (data/content.db)     │  ← 真源
            └──────────────────────────────┘
                                 │ 尽力
                                 ▼
            ┌──────────────────────────────┐
            │ Cloudflare R2                │  ← 异地镜像
            │ pages/*.mdx, blog/, work/,   │
            │ data/*.json, uploads/,       │
            │ backups/snapshot-<UTC>.tgz   │
            └──────────────────────────────┘
```

- **读取**优先走 SQLite；DB 缺失时回退文件系统并把结果写回 DB（自动种子）。
  仓库继续保留 `content/*.mdx` 与 `data/*.json` 作为基线。
- **写入**是双写：SQLite 必须成功；R2 推送是 best-effort，失败时通过
  `r2Warning` 返回（运营者知道镜像断了，但**绝不丢数据**）。
- **容器启动**先跑 `scripts/sync-from-r2.mjs`（生产建议设
  `R2_REQUIRED=1` 让缺 R2 时立即失败，否则只警告然后继续）。

### SQLite 版本化迁移

每个数据库（`content.db`、`analytics.db`、`auth.db`）在
`scripts/db/<库>/NNN-name.mjs` 有一组有序迁移，由 `scripts/db/migrate.mjs` 执行，
应用与容器启动脚本共用。每个迁移连同它在 `schema_version`（同步到
`PRAGMA user_version`）中的记录在一个 `BEGIN IMMEDIATE` 事务里完成，要么全部
生效要么完全不生效，多个进程同时打开也只执行一次。数据库打开时与服务启动时
都会迁移；已版本化的库在新迁移前会先用 `VACUUM INTO` 复制到
`data/backups/pre-migration/`（保留最新 5 份）。只允许增量变更（回滚到旧镜像
仍能运行）。`yarn db:status` 查看各库版本。

### 备份流水线

`lib/backup.ts` 打包的全站原子快照：

```
MANIFEST.json
db/content.db          ← 经 SQLite Online Backup API（WAL 一致）
data/admin.json
data/mongo_config.json
data/snapshots/{cv,home,blog,work,page}_snapshots/**
uploads/*
```

流水线：`tar pack → gzip → fs.WriteStream → 原子 rename`。本地副本写到
`data/backups/snapshot-<UTC>.tgz`；如果 R2 已配置，再推到
`backups/<UTC>.tgz` 与 `backups/latest.tgz`（后者作为低成本的「拉取目标」）。

恢复是对称的：先解到同级临时目录，关闭活跃 DB 句柄，替换文件，再把
其它目录镜像回活跃树。

`MANIFEST.json` 记录每个文件的大小与 SHA-256、行数和 `db/content.db` 的版本。

**恢复演练**（`lib/restoreDrill.ts`）：每隔 `RESTORE_DRILL_INTERVAL_HOURS`（默认每周）
把最新备份（配置了 R2 时用 `backups/latest.tgz`，否则用本地最新快照）解到临时目录
检查：归档与清单、每个文件的大小与 SHA-256、`PRAGMA integrity_check`、本版本的迁移、
与清单比对行数、渲染最新一篇已发布文章。不触碰线上站点；结果与"立即演练"按钮在
后台 → 系统，失败或过期的演练会出现在 `/api/health` 警告中。

**错误监控与系统健康**：完全自建，数据不离开服务器——浏览器未捕获错误、未处理的
Promise 拒绝、错误边界捕获、CSP 违规（`report-uri /api/e`）与服务端错误按指纹归组
存入 `data/analytics.db`，去除查询字符串、邮箱/IP、令牌和类 ID 数字，不存地址、
UA 或 Cookie；在 后台 → 系统 → 错误 中处理（已解决的错误再次出现会自动重开）。
系统健康页显示部署版本、运行时长、内存、磁盘余量、各数据库大小/WAL/版本、备份、
恢复演练与近期警告日志。

<div align="center">
  <img src="docs/screenshots/admin-storage.png" alt="存储与备份面板" width="780" />
</div>

### 后台安全

- **Edge Middleware**（`middleware.ts`）：在任何 `/admin/*` 页面或
  `/api/admin/*` 接口渲染**之前**用 `jose` 校验 `cv_admin_token` JWT。
  未登录访问 → 页面 302 到 `/admin/login?next=<原路径>`；接口直接返
  JSON 401。公开白名单：`/admin/{login,forgot,reset}` 与
  `/api/admin/{session,logout}`。
- **scrypt** 密码哈希（N=16384、r=8、p=1、64 字节 key，异步计算），每账户
  独立的 16 字节随机盐。比较一律走 `crypto.timingSafeEqual` 且两侧 buffer 等长。
- **登录限速**：按（规范化邮箱，客户端 IP）锁定并逐步退避；持续失败时，
  全站排队限制凭据尝试的总速率。登录成功会写入签名的长期"已知设备"
  Cookie，站长可绕过该队列。邮箱不存在与密码错误的响应完全一致。
- **按路由的 IP 限流**（IPv6 按 /64 与 /48 归并）。只信任来自本机回环和
  容器默认网关的 `cf-connecting-ip`（即 Cloudflare Tunnel 经 Docker 端口
  映射到达的方式），除非设置了 `TRUSTED_PROXY_IPS`。
- **CSRF**：中间件拒绝所有跨站（`Origin` / `Sec-Fetch-Site`）以及非 JSON 的
  后台与内容写入请求，作为 `SameSite=Strict` 之上的纵深防御。
- **通行密钥（Passkey）**：基于 WebAuthn（`@simplewebauthn/server`），可用
  Face ID / Touch ID / Windows Hello / 安全密钥登录（按钮或邮箱输入框的自动
  填充），密码仍可作为后备。十个一次性恢复码（只存哈希）。开启"必须使用通行
  密钥"后，仅凭密码无法登录，还需一个恢复码。在 后台 → 安全 中管理。
- **会话**：每个已登录的浏览器在 `data/auth.db` 中有一行（JWT 携带其 id）；
  登出只结束当前浏览器，后台 → 安全 列出所有浏览器（粗粒度设备、网段、国家）
  并可单独或全部登出；重置密码会吊销全部会话。
- **二次验证（Step-up）**：恢复备份、删除文章或案例、MongoDB 恢复/目标变更，
  以及任何通行密钥、恢复码、策略或其他浏览器的变更，都要求在
  `ADMIN_RECENT_AUTH_MINUTES`（默认 10）分钟内登录或重新验证过，否则弹出
  "确认是你本人"对话框（通行密钥，或密码 + 恢复码）后再继续。
- **登录记录**：登录、失败（仅时间、方式、国家与原因代码，不含地址或设备）与安全变更。
- **JWT** 走 HS256（固定算法），7 天有效期，签名密钥 `JWT_SECRET`。
- **Cookie**：`httpOnly`、`sameSite: 'strict'`、生产开 `secure`、`path: /`。
- **重置 Token**：24 字节随机、30 分钟 TTL、一次性、常量时间比较、
  每次读取自动清理过期项。
- **后台页面**：统一下发 `X-Robots-Tag: noindex, nofollow, noarchive`
  和 `Cache-Control: no-store`，让搜索引擎与中间缓存都收不到。
- **Edge 跳转**（中间件，GET/HEAD，308）：对已配置的公开域名
  （`SITE_URL` / `NEXT_PUBLIC_SITE_HOST`，绝不包括回环地址）的明文 HTTP 请求
  跳转到 HTTPS——访客使用的协议取自 Cloudflare 的 `cf-visitor`，否则取
  `X-Forwarded-Proto`；`/api/health` 不跳转。旧地址 `/cv?lang=zh|cn` 跳到
  `/cv/zh`。
- **没有图片优化器**：`images.unoptimized`——`/_next/image` 返回 404，任何
  请求都到不了 sharp/libheif（GHSA-2xp9-vwfh-vxw4）。图片只在上传时处理一次。
- **CSP**：生产环境不含 `'unsafe-eval'`（MDX 由服务端生成的树渲染）。
- **SSRF**：服务端抓取任何来自内容或后台的 URL 都经过
  `lib/security/safeFetch.ts`（只允许公网地址，限制大小、跳转次数与时长）。

### 分节可见性

首页所有 `[NN]` 板块都过一遍 `isSectionVisible(home, key)`，
`key ∈ {introduction, brands, open-source, tech-stack, activity, projects,
experience, certifications, photos, contact}`。键缺失默认**显示**——
新装实例自带完整页面。

入口：**后台 → Home → Visibility**。

### Currently-coding 芯片

头像下方的三行小字（`label / project / note`）。每行独立按
**后台手填 → 从 CV 自动推 → 留空**的优先级合并：

- 后台手填非空 → 用手填值。
- 否则由 `lib/currentlyCoding.ts` 从 `data/cvdata.json` 自动推导：
  - `label` → `"currently coding"`
  - `project` → 「当前最相关」的 `workExperience.companyName`
    （优先在职岗位，按开始日期升序取最长持续者；都已结束则取
    最近一份）
  - `note` → `"since <最早年份>"`，取所有带日期 CV 条目的最小年份
- 三行合并值**全为空**时整个芯片才会隐藏。

后台编辑器把自动推导值作为输入框的 placeholder 显示，并在下方加一行
小字 `Auto-derived now: …`，让运营者一眼看到「留空时访客会看到什么」。

---

## 隐私：第一方访问统计

Analytics 标签页的数据由站点自己收集（`POST /api/a`）；没有第三方脚本，也
没有 Cookie。

- **以下情况什么都不记录**：浏览器发送 `DNT: 1` 或 `Sec-GPC: 1`、爬虫、已
  登录的站长（`cv_admin_token` / `cv_admin_hint` Cookie），以及公开页面以外
  的路径。
- **不保存 IP 地址与 User-Agent。** 访客标识为
  `sha256(每日盐 + 站点域名 + IP + User-Agent)` 截取的 16 位十六进制。盐是
  随机的，在 UTC 零点轮换且只存在于内存中，因此同一个人无法跨天关联（重启
  也会换新盐）。
- 每次访问只保留：路径、来源域名（仅当来自其他站点）、国家（Cloudflare 的
  `cf-ipcountry`）、粗略的设备与浏览器类别、页面语言。Web Vitals 只保留
  路由、指标、数值与评级。
- **存储与保留期**：独立的 `data/analytics.db`（不进入 `content.db`、R2 同步
  或恢复）。原始访问记录保留 35 天，原始 Web Vitals 保留 30 天，按日汇总
  保留 400 天。
- `/colophon` 页面公开说明了同样的内容。

---

## CLI 脚本

```bash
yarn content:migrate    # 文件系统 → SQLite（幂等）
yarn content:pull       # R2 → SQLite（覆盖；读 .env）
yarn content:push       # SQLite → R2（覆盖；读 .env）
yarn content:list       # 列出 R2 对象
yarn check              # tsc + ESLint + 单元测试
yarn e2e                # 针对 E2E_BASE_URL 运行 Playwright + axe（默认 http://127.0.0.1:3000）
yarn audit:deps         # 生产依赖审计关卡（security/audit-allowlist.json）
yarn db:status          # 各 SQLite 库的版本（只读）
yarn db:migrate         # 执行待迁移（启动时也会自动执行）
node scripts/perf-budget.mjs          # 对最近一次 `yarn build` 做性能预算检查
node --env-file=.env scripts/cloudflare-config.mjs --dry-run   # Cloudflare 区域配置
scripts/deploy.sh                     # 把 main 部署到生产环境
```

---

## Docker

```bash
cp docker-compose.override.example.yml docker-compose.override.yml   # 每台主机一次
docker compose up -d --build
```

`docker-compose.override.yml` **不纳入版本库**：每台主机按
`docker-compose.override.example.yml` 保留自己的副本。示例只把站点绑定到
`127.0.0.1:3002`（Cloudflare Tunnel 从这里接入；CI 会断言合并后的配置不对
回环以外的地址暴露端口），用 `./data` 与 `./public/uploads` 的绑定挂载取代
具名卷，并轮转容器日志（`local` 驱动，5 × 10 MB）。基础文件还去掉了全部 Linux
capability、设置 `no-new-privileges` 与进程数上限（CI 断言这三项，并用同样参数
启动容器跑 E2E）。根文件系统保持可写：ISR 会改写 `/app/.next/server` 下的预渲染
页面，只读镜像需要把该目录放到每次部署都重新初始化的卷上。生产服务器已迁移过一次——
先把本地修改过、之前被跟踪的覆盖文件挪开，拉取删除它的提交，再放回服务器
副本；`scripts/deploy.sh` 会自动完成这一步。

镜像使用 BuildKit 构建（`# syntax=docker/dockerfile:1.7`）：yarn 与 Next 的
缓存放在缓存挂载中；两个阶段都使用按 digest 固定的 `node:22-alpine`
（Dependabot 会提出 digest 更新）；去掉 glibc 版 sharp 二进制（Alpine 使用
musl）；发布阶段只包含 Next 追踪出的 standalone 输出——构建时会校验内容脚本
所需模块（`better-sqlite3`、`gray-matter`、`@aws-sdk/client-s3`、`sharp`）
都能从中加载。`NEXT_PUBLIC_BUILD_SHA`（由部署脚本设置）会把部署的提交显示在
`/colophon` 上。

自带的 `docker-entrypoint.sh`（由 `dumb-init` 托管）在启动时先运行
`sync-from-r2.mjs`：按真实时间戳对齐本地 SQLite 与 R2 镜像，并补齐此前未能
写入 R2 的内容；随后启动服务器和 `scripts/warm-isr.mjs`，用真实数据重新生成
所有静态页面（镜像构建时不含数据库）。`./data` 与 `./public/uploads` 通过卷或
绑定挂载持久化。

运行时配置来自 `.env`（`env_file`）；公开的 `NEXT_PUBLIC_*` 变量同时作为构建
参数传入，因为 Next 会在构建时把它们写进前端代码。

---

## 部署到生产环境

`scripts/deploy.sh` 是唯一的部署方式。它在你的电脑上运行，通过
`ssh vultr_tokyo`（`~/.ssh/config` 中的别名）操作服务器。服务器上没有 GitHub
凭据：新提交以 git bundle 的形式传过去。

```bash
git switch main && git pull && git push   # main == origin/main，且 CI 通过
scripts/deploy.sh                         # --force 重新构建当前已部署的提交
```

1. **预检**：工作区干净、位于 `main`、`main` 已推送到 `origin`、服务器可达，
   且服务器 HEAD 是 `main` 的祖先（只允许快进）。
2. **备份**到 `/root/landing_page-backups/<UTC 时间戳>/`：通过运行中容器里
   better-sqlite3 的 `.backup()` 在线备份 `content.db`（以及 `analytics.db`），
   打包 `data/`（不含其自身的 `backups/`）与 `public/uploads/`，复制 `.env` 与
   compose 覆盖文件；当前镜像打上 `…:pre-<时间戳>` 标签。
3. **更新**：检出目录从 bundle 快进。服务器自己的 `data/home.json` 和
   `docker-compose.override.yml` 逐字节保留；出现其他本地修改则中止部署。
4. **构建**：执行 `docker compose build`，旧容器继续提供服务。构建失败时恢复
   检出目录，其余一切未变。
5. **切换**：`docker compose up -d --no-build`，然后等待容器变为 `healthy` 并
   输出 `[warm-isr] regenerated`、`/api/health` 返回 `"status":"ok"`，且端口
   只绑定在 `127.0.0.1`。
6. **冒烟测试**：经 `https://lucian-dev.com` 访问主要页面、订阅源、站点地图、
   健康检查和旧 CV 跳转（带破缓存参数，确保由新的源站响应）。
7. **回滚**：切换后任何一步失败都会执行 `docker tag …:pre-<时间戳> …:latest &&
   docker compose up -d --no-build`，恢复检出目录，并打印失败容器最后 100 行
   日志和备份路径。成功时写入 `.deployed-sha` 并清理旧镜像（保留最近三个回滚
   镜像），同时清理备份：只保留最新的十个 `<UTC 时间戳>/` 备份目录（每个都含
   一份 `.env`），逐一列出被删除的目录，`/root/landing_page-backups/` 中的其他
   内容一概不动。

部署后对生产环境运行公开部分的端到端测试：

```bash
E2E_BASE_URL=https://lucian-dev.com yarn e2e --grep-invert @admin
```

---

## Cloudflare

`scripts/cloudflare-config.mjs` 把区域配置保存在仓库中，并以幂等方式应用
（先读取每项设置与规则集，只写入有差异的部分并打印差异；`--dry-run` 不写入
任何内容；任何 API 错误都以退出码 1 结束）。它管理的规则带有 `lp_` 前缀的
ref；在控制台中手动添加的规则会被保留。

- 区域设置：开启 **Always Use HTTPS**，关闭 **Email Address Obfuscation**
  （它改写的 HTML 会破坏 React 水合）。
- 针对站点域名的配置规则：关闭邮箱混淆，关闭 Web Analytics（RUM）脚本注入——
  站点有自己的统计，CSP 保持不变。
- 跳转规则：`www.<域名>` → `https://<域名><路径>`（308，保留查询串）；缺少时
  会创建经代理的 `www` CNAME。
- 缓存规则：公开页面、订阅源、站点地图、`/api/og`、`/api/stack`、
  `/api/search-index` 与 `/api/github/*` 允许缓存，边缘 TTL 取自源站
  （ISR 页面带 `s-maxage`；服务端渲染页面发送 `no-store`，不会被缓存）；
  `/admin*`、`/api/admin*`、`/api/auth*` 以及任何带管理员会话 Cookie 的请求都
  绕过缓存。

```bash
CF_API_TOKEN=… CF_ZONE_ID=… node scripts/cloudflare-config.mjs --dry-run
CF_API_TOKEN=… CF_ZONE_ID=… node scripts/cloudflare-config.mjs
```

这次一次性运行所需的令牌权限：Zone Settings:Edit、Config Rules:Edit、
Cache Rules:Edit、Dynamic Redirect:Edit、DNS:Edit，以及可选的 Account
Analytics:Edit（没有它时，脚本会打印在控制台中手动关闭 Web Analytics 自动
安装的步骤）。

运行时，设置 `CF_ZONE_ID` + `CF_API_TOKEN`（只需 Cache Purge 权限的令牌）后，
每次按需重新生成页面都会以每批 30 个清除刷新过的 URL——文章或案例变化时还会
清除订阅源、站点地图与搜索索引；设置 `INDEXNOW_KEY` 后，页面 URL 会推送给
IndexNow（密钥文件位于站点根目录 `/<INDEXNOW_KEY>.txt`：密钥文件只对其所在
目录及以下的 URL 有效；中间件只把这一个路径改写到 `/api/indexnow-key`）。两者都是发出即不等待、3 秒
超时、记录日志，且绝不会导致保存失败；未设置环境变量时什么都不发送。

---

## 质量关卡

CI（`.github/workflows/ci.yml`）在每次推送和 Pull Request 时运行：

| 任务 | 必须通过 |
|---|---|
| build | `tsc`、零警告的 ESLint、单元测试、`next build --webpack`，以及性能预算（`scripts/perf-budget.mjs`：共享与逐页首屏 JS、共享 CSS、预加载字体的数量与体积） |
| audit | `scripts/check-audit.mjs`：生产依赖中不得有高危 / 严重漏洞，除非在 `security/audit-allowlist.json` 中写明理由与到期日；过期条目同样失败。完整报告作为构建产物保留 |
| docker | 合并后的 compose 配置只暴露回环地址；镜像能构建、在空数据卷上启动、提供服务、预热 ISR 页面并优雅停止；随后针对该容器运行 Playwright + axe 测试 |

端到端测试（`e2e/`）在桌面、平板、手机与减少动效四种配置下检查每个公开页面：
恰好一个可见的 `h1`、`lang`（`/cv/zh` 为 `zh-Hans`）、标题与描述、无严重 /
关键级 axe 问题（WCAG 2.0–2.2 A/AA）、无横向滚动、手机上 24 × 24 px 的点击目标
（正文内联链接除外）、减少动效时没有正在播放的动画、主题持久化、⌘K 命令面板和
旧地址跳转——任何控制台错误、未捕获异常或 CSP 违规都会使测试失败。`@admin`
用例（仅在 CI 中）会登录后台，端到端地隐藏并恢复一个 CV 字段，制造两个编辑器
之间的「Changed elsewhere」冲突，打开快捷键面板，并跟踪一条联系留言进入收件箱。

---

## 公开路由

| 路由 | 说明 |
|---|---|
| `/` | 首页 — 按可见性组合 `[NN]` 板块 |
| `/about` | 长版本介绍 + GitHub 数据 + 双语 CV 栈 |
| `/cv` | 可打印的英文 CV（浏览器另存 PDF，`?print=1`） |
| `/cv/zh` | 同一份 CV 的中文版（`/cv?lang=zh` 跳转至此） |
| `/work` | 案例研究索引（MDX） |
| `/work/[slug]` | 单篇案例（封面 + 正文） |
| `/blog` | 博客索引 + 标签筛选 + 订阅源链接 |
| `/blog/[slug]` | 单篇博文（语法高亮、目录、可放大的图片） |
| `/now` | 「最近在做什么」（MDX） |
| `/uses` | 工具、硬件、服务清单（MDX） |
| `/contact` | 联系页：表单、可用状态、复制按钮、vCard + 二维码 |
| `/colophon` | 本站如何构建、隐私说明、更新日志、部署的提交 |
| `/feed.xml`、`/work/feed.xml`、`/feed.json` | 全文 RSS（文章、案例）与 JSON Feed |
| `/sitemap.xml` | 站点地图（含 EN / 中 CV 互链） |
| `/api/search-index` | 供命令面板使用的公开搜索文档 |
| `/api/vcard` | 公开联系方式的 vCard |
| `/api/health` | 健康状态：所有人只看到 `{"status":"ok"\|"empty"\|"degraded"}`；存储、内容、备份时长、待同步的 R2 写入仅对管理员或携带 `Authorization: Bearer <HEALTH_TOKEN>` 的请求返回 |
| `/.well-known/security.txt` | RFC 9116 安全联系方式（公开简历中的邮箱，有效期滚动 180 天；邮箱隐藏时返回 404） |

API 在 `/api/*`；`/api/admin/*` 全部需要鉴权（Middleware 把关）。

---

## 后台页面（已鉴权）

| 路由 | 用途 |
|---|---|
| `/admin/login` | 登录（**隐蔽**入口：导航无可见链接；走 ⌘K 命令面板或直接输 URL） |
| `/admin/forgot` + `/admin/reset` | 邮件密码重置流程 |
| `/admin` | 状态中心：需要处理的事项、实时计数、各编辑器入口 |
| `/admin/dashboard?tab=home` | HomeEditor — Hero / Contact / 可见性 / 品牌 / 照片 |
| `/admin/dashboard?tab=cv` | CV Studio（逐字段显示/隐藏、隐藏项面板、A4 / 网站预览）+ 原始 JSON |
| `/admin/dashboard?tab=versions` | 版本回滚 |
| `/admin/dashboard?tab=storage` | SQLite + R2 清单，手动 Backup / Pull |
| `/admin/dashboard?tab=inbox` | 联系收件箱：阅读、邮件回复、标记、删除 |
| `/admin/dashboard?tab=analytics` | 第一方访问量、来源、设备与真实用户 Web Vitals |
| `/admin/blog`、`/admin/blog/edit?slug=…` | 博客管理：草稿、发布检查清单、实时预览、历史 |
| `/admin/work`、`/admin/work/edit?slug=…` | 案例研究管理 |
| `/admin/now`、`/admin/uses` | 单页编辑器 |
| `/admin/db-config` | MongoDB 连接 + 手动备份/恢复 |
| `/admin/security` | 通行密钥、恢复码、"必须使用通行密钥"、已登录浏览器、登录记录 |
| `/admin/system` | 系统健康（版本、磁盘、数据库、备份、恢复演练、近期警告）与 `?view=errors` 错误监控（自建，不发给第三方） |

在任意后台页面按 `?` 可查看键盘快捷键。

<div align="center">
  <img src="docs/screenshots/admin-cv-studio.png" alt="CV Studio" width="780" />
  <br /><sub>后台 → CV → Studio：分屏编辑 + 实时预览</sub>
</div>

---

## 截图

推荐的截图放在 [`docs/screenshots/`](./docs/screenshots/) 目录。
按照[索引](./docs/screenshots/README.md)给出的文件名命名即可被
README 自动引用。**请勿提交**包含真实凭据、付费仪表盘或个人联系
方式的截图。

---

## 安全披露

发现安全问题请**不要**直接开 issue。请发邮件到
[`/.well-known/security.txt`](https://lucian-dev.com/.well-known/security.txt)
（RFC 9116）中 `Contact:` 给出的地址；范围与响应时间见
[SECURITY.md](./SECURITY.md)。优先采用协调披露策略。每个部署都会根据公开
简历中的邮箱自动生成自己的 security.txt（简历隐藏邮箱时返回 404）。

已知限制（设计取舍，已记录）：
- 内存级限流器在服务重启时清零。生产建议在反向代理或 Cloudflare
  侧再叠一层持久限流。
- 单部署只支持一个管理员账户。本项目是作品集 CMS，**不是**
  多租户 SaaS。

---

## 许可证

[MIT](./LICENSE) © 贡献者。

欢迎 fork 出自己的版本；改顺手了的话，记得提个 PR 回来。
