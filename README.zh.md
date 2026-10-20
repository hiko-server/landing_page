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
- **论文（Publications）**：CV 中新增论文板块（作者按顺序、发表载体、状态、DOI、
  链接、摘要），在 `/cv`、`/cv/zh`、阅读视图、A4 页面以及可下载的简历（中英文 PDF、
  纯文本、JSON Resume 的 `publications`）中以引用格式呈现，并在
  `/publications` 提供 BibTeX / APA 复制与 ScholarlyArticle 结构化数据。首页可显示
  “Selected Publications”板块（可排序，默认位于项目之后），/about 侧栏链接论文列表并
  显示篇数，⌘K 可搜索每篇论文，论文关键词计入技能出处，首页编辑器会把已发表论文
  原文作为成果条建议，CV Studio 的就绪检查会提示缺少载体、日期或 DOI / 链接的已发表
  论文，以及“审稿中”超过 18 个月的论文。本人姓名
  依据公开的个人信息自动加粗；尚未发表的论文始终标明真实状态；被隐藏的合著者显示
  为 “…”，作者顺序保持真实。在出现第一篇公开论文之前，网站上不显示任何相关内容
  （无板块、无导航链接，`/publications` 返回 404）。逻辑位于 `lib/publications/`。
- **ORCID iD**：CV Studio 的个人信息新增 ORCID iD 字段（按 ORCID 的 MOD 11-2 校验位
  检查；粘贴 `https://orcid.org/…` 链接会存为纯 iD），同样可用眼睛图标隐藏。填写后按
  ORCID 的 iD 展示规范显示——绿色 iD 图标加完整的 `https://orcid.org/…` 链接——出现在
  `/cv`、`/cv/zh`、`/publications` 和 /about 侧栏，PDF 与纯文本简历中为文字链接，
  JSON Resume 中为一项 profile，并写入 vCard、Person 结构化数据（`sameAs` 与 ORCID
  `identifier`，论文作者的 `@id`）和 `/llms.txt` 的一行；隐藏后任何地方都不出现。论文板块的
  **Import from ORCID** 会列出该 ORCID 记录的公开作品（由服务器经 ORCID 公共 API 读取，
  不保存任何内容），标出 CV 中已有的论文（DOI 或标题相同），勾选的作品作为论文加入，
  保存前可逐条修改。字段旁的 **Connect your ORCID iD** 通过登录 ORCID 证明该 iD 属于
  站长；在此之前，手动填写的 iD 按规范显示 ORCID 的“未认证”iD 图标，并在链接后注明
  “(unauthenticated)”/“（未经认证）”——详见
  [连接 ORCID iD](#连接-orcid-idconnect-your-orcid-id)。逻辑位于 `lib/orcid/`。
- **面向非工程师的后台**：可视化编辑 Hero、品牌、社交、照片墙、博客、
  案例研究、CV（Studio + 原始 JSON）、Now/Uses，以及关于页自述。
- **逐节可见性与排序**：首页所有板块（Open Source / Skills /
  Activity / Projects / Publications / Writing / Experience / Certs / Photos /
  Contact）都可从后台隐藏、拖拽排序，或一键套用「招聘者优先」预设，无需改代码。
- **成就条**：Hero 下方最多 4 个站长亲写的成就块，每块链接到出处；编辑器从公开
  CV（奖项、专利、已发表论文、学历）原文生成建议，保存之前首页不显示任何内容。
- **联系面板可编辑**：标题、眉标、副标语、原因下拉项均来自
  `data/home.json`；留空时回退到内置默认值。
- **后台收件箱**：联系表单的每条留言都会连同是否已发出邮件一起保存；
  支持收件箱 / 星标 / 归档、按来意筛选、搜索（`is:unread`、`kind:role`）、
  星标、归档、已回复、可撤销的删除，以及带线程和中英模板的邮件回复——回复
  从 SMTP 账号自己的地址发出（能通过收件方的 DMARC 检查），Reply-To 是网站
  公开的邮箱。没有配置 SMTP 时，同一份草稿可用自己的邮件程序打开。
- **键盘优先的后台**：⌘K 列出所有后台页面和当前视图的操作；`G` 加字母直接跳转
  （`G I` 收件箱、`G S` 系统…）；列表用 `j` / `k`；`?` 打开可搜索的快捷键表。
- **工业级后台认证**：scrypt + 16 字节随机盐；按（邮箱，IP）锁定，遭受攻击时
  全站限制尝试速率；按 IP 限流；`httpOnly` + `SameSite=Strict`
  + `Secure` Cookie；Next.js 代理（`proxy.ts`）校验会话——签名与吊销状态，
  未登录或已登出的访客**完全无法看到**任何 admin 页面；每个响应都带基于哈希的
  严格 CSP、HSTS、COOP / CORP、Permissions-Policy 与 X-Robots。

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
  灯箱的全宽 Field Notes 照片带。紧凑的开源板块（有意义的统计、按级别各用一条
  path 绘制并附文字摘要的靛蓝色贡献图、前五语言加「其他」的单根堆叠条、三个置顶
  仓库）只把实际渲染的字段写进 HTML；联系板块是可用状态卡片加一个通往
  `/contact` 的「Write to me」按钮。
- **关于页**：粘性身份栏（头像、姓名、可用状态、简历、社交链接、章节导航），右侧是
  站长自述（后台 → About bio，留空则不显示）和全部展开的双语 CV。
- **联系页**：可用状态卡片（仅当站长设置时显示）、复制按钮、vCard
  （`/api/vcard`）及用于保存联系人的二维码。
- **文章**：GitHub 风格 Markdown、零布局偏移且带 `srcset` 与点按放大的图片、
  YouTube 与 Figure 组件、案例封面、标题锚点和目录。
- **中文排版与中英互译**：中文文章与案例使用中文界面文字（日期 / 阅读 /
  ← 全部文章 …）和中文排版——约 34 字行长、1.85 行高、中西文之间自动加间距、
  用着重号代替伪斜体。同一篇内容的中英文版本在编辑器「Language &
  translations」里填同一个翻译键（或点「Create draft」复制出另一种语言的草稿
  再自行翻译），页面就会出现「阅读中文版 / Read in English」切换、hreflang
  互链和站点地图互链，列表只显示一次（优先英文版）。界面文字统一放在
  `lib/uiStrings/`。
- **图片查看器**：文章与案例中的每张图片（以及首页 Field Notes 照片）都可全屏
  查看——从原图位置放大展开，关闭时飞回原位。左右滑动切换，双指或双击缩放
  （只缩放图片，不会缩放整页），下拉关闭；鼠标可点击放大、用滚轮缩放；键盘支持
  方向键、+ / − / 0 和 Esc。手势引擎在 `components/Common/lightboxEngine.ts`，
  相关计算在 `lib/lightboxGestures.ts` 与 `lib/lightboxPhysics.ts`。
- **机器可读内容**：`/llms.txt`（llmstxt.org）、`/llms-full.txt`，以及每篇已发布
  文章与案例的 Markdown 版本（在地址后加 `.md`，如 `/blog/<slug>.md`）；只含公开
  内容，草稿与简历数据从不出现，`robots.txt` 不变。
- **可发现性**：标题带上站长姓名，ProfilePage / Person JSON-LD，品牌字体的
  社交卡片，以及全文订阅源：`/feed.xml`（RSS，逐条标注语言）、
  `/work/feed.xml`、`/feed.json`，列在页脚「This site」一栏，与技术说明和隐私说明并列。
- **命令面板 4.0**（⌘K / `/`）：按需加载，键盘打开时立即出现，通过
  `/api/search-index` 全文搜索；带「Theme ›」「CV ›」「Contact ›」和
  「Keyboard shortcuts ›」（`?`）嵌套页；站长登录后多出「Admin」分组，含随当前
  页面变化的「编辑此页」。访客还可用 `J` / `K` 在列表中移动、`[` / `]` 切换文章、
  `T` 切换主题、`G` 加字母跳转。面板里的「Keyboard shortcuts: on/off」（后台
  `?` 面板里也有）可按浏览器关闭全部单键快捷键。
  搜索支持中文：中文简历已纳入索引，中文按双字切分，搜
  「实习」「香港」「专利」都能找到对应条目；也能理解问句（“他有专利吗？”会搜索
  “专利”，常见招聘用词中英互通）。结果和 404 页的「Did you mean」都会标出命中的词。
- **问问 Lucian（Ask Lucian）**：命令面板的「Ask」模式（/about 和 /contact
  也有入口），用中文或英文提问，**只用本站原文作答**——简历条目、文章和页面段落，
  每段都链接到原文位置（浏览器会高亮该段）。不生成任何内容，问题也不会离开浏览器；
  找不到对应原文就直说，并提供联系表单（问题已填入留言）。段落只取自公开内容
  （隐藏的简历字段、条目和板块、未获授权的推荐语、草稿都不会出现），每次保存后
  重新生成，所以改简历就能改答案。
- **主题**：跟随系统 / 浅色 / 深色。顶栏一键切换，旁边的菜单、⌘K 和移动端菜单
  都可选三种偏好（同一份存储的偏好，彼此一致）；默认深色（`NEXT_PUBLIC_DEFAULT_THEME`），在首帧绘制前生效，任何
  页面都不会闪错颜色；选「跟随系统」时随操作系统切换。
- **设计系统**：流式字号、文本样式、圆角、容器宽度，以及一条缓动曲线加三档
  时长，统一为令牌（`theme/tokens.ts`）；带突破线的页面网格、状态与阴影颜色
  令牌，统一而朴素的板块标题样式（不再使用编号或方括号标签），公开页面统一使用按
  4 px 网格取尺寸的 Lucide 图标；合作 Logo 在保存时
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
- **首页编辑器**：照片 / Logo / 链接卡片和板块顺序可排序（鼠标、触控、键盘），
  带 CV 建议的成就条、可用状态、精选仓库、Logo 缩放、站点名称。
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
  GHSA-2xp9-vwfh-vxw4）；生产环境 CSP 只按哈希放行脚本（不含 `'unsafe-inline'`
  与 `'unsafe-eval'`），不允许任何第三方脚本域名。
- 代理（`proxy.ts`）对公开域名做 HTTP → HTTPS（308）跳转并处理旧 CV 地址；服务端抓取由
  内容或后台提供的 URL 时一律经过 `lib/security/safeFetch.ts`。
- 服务器上的 compose 覆盖文件不再纳入版本库（提供只绑定回环地址的示例），
  容器日志轮转，基础镜像按 digest 固定，发布镜像只包含追踪出的运行时文件。
- 推送前运行的[质量关卡](#质量关卡)：阻断式生产依赖审计（带到期日的豁免清单）、
  性能预算，以及构建镜像并针对它运行 Playwright + axe 端到端测试的容器关卡。
- [`scripts/deploy.sh`](#部署到生产环境)：带健康检查、备份与自动回滚的部署。
- [版本化的 Cloudflare 配置](#cloudflare)，以及每次重新生成页面时按环境变量
  启用的缓存清除与 IndexNow 推送。

---

## 技术栈

| 层 | 选型 | 取舍说明 |
|---|---|---|
| 框架 | **Next.js 16（Pages Router，webpack 构建）** + **React 18** | 成熟的 SSR/ISR、文件式 API、Node.js 请求代理（proxy） |
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
| 测试 | **node:test**、**Playwright** + **axe-core** | 单元测试、浏览器端到端测试与 WCAG 2.2 AA 检查 |

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
│   ├── home.json        # 纳入版本库的示例种子：Hero / 社交 / 品牌 / 照片墙
│   ├── cvdata.json      # 纳入版本库的示例 CV 种子（en/zh，虚构内容）
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
├── proxy.ts             # 跳转、安全响应头、CSRF、后台鉴权门（Node.js）
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
| 邮件 | `SMTP_HOST/PORT/USER/PASS`、`FROM_EMAIL`、`NOTIFY_EMAIL`、`REPLY_FROM_EMAIL`（收件箱回复的发件地址，默认为 SMTP 账号本身） | 可选 — 未设置时静默跳过 |
| 联系验证码 | 无 — 内置 nonce + 数学题 + 蜜罐 | 不适用 |
| GitHub | `GITHUB_TOKEN`（细粒度令牌，仅公开仓库只读，不授予任何权限） | 推荐（API 限额 60 → 5000/h） |
| MongoDB 备份 | `MONGODB_URI`、`MONGODB_DB_NAME` | 可选 |
| Cloudflare R2 | `R2_ENDPOINT`、`R2_BUCKET`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_REQUIRED` | 可选 |
| 定时备份 | `BACKUP_INTERVAL_HOURS`（默认 24，`0` 关闭） | 可选 |
| 留言保存期限 | `CONTACT_RETENTION_DAYS`（默认 365 天，`0` 表示保留到手动删除；每晚自动清理过期留言，超过期限的全站快照也会被清理） | 可选 |
| 旧构建的浏览器资源 | `STATIC_ARCHIVE_DAYS`（天数，1–90，默认 7：部署后前几次构建的 `/_next/static` 文件继续提供多久） | 可选 |
| 图片编码 | `IMAGE_JOB_CONCURRENCY`（同时编码的图片数，1–4，默认 1）、`IMAGE_JOB_QUEUE_MAX`（可排队等待的上传数，0–64，默认 8；超出则返回 503“忙碌”）、`SHARP_CONCURRENCY`（每张图片的 libvips 线程数，1–4，默认取 CPU 数，最多 2） | 可选 — 默认值让并发上传不超出 1 GiB 的容器内存 |
| 日志 | `LOG_LEVEL`（`debug` / `info` / `warn` / `error`） | 可选 |
| Cloudflare 缓存清除 | `CF_ZONE_ID`、`CF_API_TOKEN` | 可选 — 两者都设置才会发送 |
| IndexNow | `INDEXNOW_KEY`（8–128 位 `[A-Za-z0-9-]`） | 可选 — 未设置即关闭 |
| 健康详情 | `HEALTH_TOKEN`（供监控使用的 Bearer 令牌） | 可选 — 未设置时只有已登录的管理员能看到 `/api/health` 详情 |
| 后台二次验证 | `ADMIN_RECENT_AUTH_MINUTES`（1–60，默认 10） | 可选 |
| 恢复演练 | `RESTORE_DRILL_INTERVAL_HOURS`（默认 168，`0` 关闭） | 可选 |
| ORCID 连接 | `ORCID_CLIENT_ID`、`ORCID_CLIENT_SECRET`、`ORCID_ENV`（默认 `production`，或 `sandbox`） | 可选 — 未设置时 “Connect your ORCID iD” 保持禁用（[配置方法](#连接-orcid-idconnect-your-orcid-id)） |

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
Promise 拒绝、错误边界捕获、CSP 违规与 Trusted Types 报告（`report-to` / `report-uri` →
`/api/e`；仅报告模式的 Trusted Types 分组按每组每天最多 50 条抽样，只保留接收点名称、
不存样本文本）与服务端错误按指纹归组
存入 `data/analytics.db`，去除查询字符串、邮箱/IP、令牌和类 ID 数字，不存地址、
UA 或 Cookie；在 后台 → 系统 → 错误 中处理（已解决的错误再次出现会自动重开）。
系统健康页显示部署版本、运行时长、内存、磁盘余量、各数据库大小/WAL/版本、备份、
恢复演练与近期警告日志。

**内容健康**（后台 → 系统 → 内容，健康页有摘要）：检查所有已发布的文章、案例、页面、
简历和首页——失效或已迁移的链接（每天一次、礼貌的外链检查：经 `safeFetch`、先发 HEAD、
同一站点一次只发一个请求，结果存于 `data/content-health/links.json`；LinkedIn 的 999
和机器人拦截算作"无法验证"，不算失效）、指向不存在或草稿文章的链接、链接里的跟踪参数、
缺失 / 外链 / 过大 / 缺少响应式尺寸 / 用文件名当 alt 的图片、标题层级、重复或缺失的描述，
以及硬换行。能安全修复的一键完成——去掉跟踪参数、把外链图片导入上传目录、生成响应式
尺寸、改用链接的新地址、删掉多余的换行——都走编辑器自己的保存流程（版本快照、R2 镜像、
页面重新生成；若内容在报告之后改过则以 409 拒绝）；需要你亲自措辞的则链接到编辑器。
`j` / `k` 浏览问题，`f` 应用当前问题的修复。环境变量 `LINK_CHECK_INTERVAL_HOURS`
（默认 24，`0` 关闭定时检查）。

**操作日志**（后台 → 系统 → 操作日志）：记录每次成功的后台写入——保存、发布、恢复、
删除、收件箱操作与回复、上传、备份、安全设置——谁（已登录的浏览器：设备类型、网段、
国家，从不存完整地址）、做了什么、何时，并与登录记录里的登录和密码重置合并显示。
它存放在独立的 `data/audit.db`（`scripts/db/audit` 版本化迁移，保留 400 天 / 2 万条），
部署时会在线备份，不进入内容快照，所以恢复内容不会改写它。`lib/audit/describe.ts`
列出的路由由 `withApi` 自动记录；只有在运行时才知道操作内容的路由，在写入成功后调用
`recordAdminAudit(req, res, { action, area, target, summary })`（`lib/audit/record.ts`）；
既不在列表里也不调用它的写入路由会让单元测试失败。版本历史会说明每个版本是被哪次改动
替换的，差异精确到词（中文用 `Intl.Segmenter` 分词）。

<div align="center">
  <img src="docs/screenshots/admin-storage.png" alt="存储与备份面板" width="780" />
</div>

### 后台安全

- **代理鉴权门**（`proxy.ts`，Next.js 16 的 proxy，运行在 Node.js 上）：在任何
  `/admin/*` 页面或 `/api/admin/*` 接口渲染**之前**校验 `cv_admin_token`：
  JWT 签名（`jose`，固定 HS256）以及吊销状态——`data/admin.json` 中的会话版本与
  `data/auth.db` 中该浏览器的会话记录，因此已登出或被吊销的浏览器也看不到后台页面
  外壳。未登录访问 → 页面跳到 `/admin/login?next=<原路径>`；接口直接返 JSON 401。
  公开白名单：`/admin/{login,forgot,reset}` 与 `/api/admin/{session,logout}`，
  以及自行鉴权的 `GET /api/admin/orcid/callback`（见“连接 ORCID iD”）。
  每个接口自身仍会再校验一次会话。
- **scrypt** 密码哈希（N=16384、r=8、p=1、64 字节 key，异步计算），每账户
  独立的 16 字节随机盐。比较一律走 `crypto.timingSafeEqual` 且两侧 buffer 等长。
- **登录限速**：按（规范化邮箱，客户端 IP）锁定并逐步退避；持续失败时，
  全站排队限制凭据尝试的总速率。登录成功会写入签名的长期"已知设备"
  Cookie，站长可绕过该队列。邮箱不存在与密码错误的响应完全一致。
- **按路由的 IP 限流**（IPv6 按 /64 与 /48 归并）。只信任来自本机回环和
  容器默认网关的 `cf-connecting-ip`（即 Cloudflare Tunnel 经 Docker 端口
  映射到达的方式），除非设置了 `TRUSTED_PROXY_IPS`。
- **CSRF**：代理拒绝所有跨站（`Origin` / `Sec-Fetch-Site`）以及非 JSON 的
  后台与内容写入请求，作为 `SameSite=Strict` 之上的纵深防御。
- **通行密钥（Passkey）**：基于 WebAuthn（`@simplewebauthn/server`），可用
  Face ID / Touch ID / Windows Hello / 安全密钥登录（按钮或邮箱输入框的自动
  填充），密码仍可作为后备。十个一次性恢复码（只存哈希）。开启"必须使用通行
  密钥"后，仅凭密码无法登录，还需一个恢复码。在 后台 → 安全 中管理。
- **会话**：每个已登录的浏览器在 `data/auth.db` 中有一行（JWT 携带其 id）；
  登出只结束当前浏览器，后台 → 安全 列出所有浏览器（粗粒度设备、网段、国家）
  并可单独或全部登出；重置密码会吊销全部会话。通行密钥更新之前就已登录的浏览器
  没有会话记录：它在下一次打开页面后才会出现在列表里，而登出任何一个浏览器
  （包括当前这个）都会同时结束所有这类浏览器。
- **二次验证（Step-up）**：恢复备份、删除文章或案例、MongoDB 恢复/目标变更，
  以及任何通行密钥、恢复码、策略或其他浏览器的变更，都要求在
  `ADMIN_RECENT_AUTH_MINUTES`（默认 10）分钟内登录或重新验证过，否则弹出
  "确认是你本人"对话框（通行密钥，或密码 + 恢复码）后再继续。
- **登录记录**：登录与安全变更（列出最近 40 条）。任何人都能造成的失败尝试只计数——
  按小时、方式、国家与原因代码，不含地址或设备——存在单独的表里，并在列表上方汇总
  （24 小时、7 天、30 天），因此大量失败尝试永远不会把一次登录挤出记录。
- **JWT** 走 HS256（固定算法），7 天有效期，签名密钥 `JWT_SECRET`。
- **Cookie**：`httpOnly`、`sameSite: 'strict'`、生产开 `secure`、`path: /`。
- **重置 Token**：24 字节随机、30 分钟 TTL、一次性、常量时间比较、
  每次读取自动清理过期项。
- **后台页面**：统一下发 `X-Robots-Tag: noindex, nofollow, noarchive`
  和 `Cache-Control: no-store`，让搜索引擎与中间缓存都收不到。
- **跳转**（代理，GET/HEAD，308）：对已配置的公开域名
  （`SITE_URL` / `NEXT_PUBLIC_SITE_HOST`，绝不包括回环地址）的明文 HTTP 请求
  跳转到 HTTPS——访客使用的协议取自 Cloudflare 的 `cf-visitor`，否则取
  `X-Forwarded-Proto`；`/api/health` 不跳转。旧地址 `/cv?lang=zh|cn` 跳到
  `/cv/zh`。
- **没有图片优化器**：`images.unoptimized`——`/_next/image` 返回 404，任何
  请求都到不了 sharp/libheif（GHSA-2xp9-vwfh-vxw4）。图片只在上传时处理一次。
- **严格 CSP**：脚本只能来自本站，以及页面渲染的四段内联脚本——按 SHA-256 放行
  （哈希由同一批常量计算，不会走样）；脚本不允许 `'unsafe-inline'` 与 `'unsafe-eval'`
  （MDX 由服务端生成的树渲染），内联事件处理器一律不执行，连接、字体与媒体只限本站。
  违规报告发到站点自己的错误面板（`report-to` / `report-uri` → `/api/e`）。Trusted
  Types 以仅报告模式运行，配一个范围很窄的默认策略，用来找出将来强制执行前还要处理的
  DOM 接收点。另有 `Cross-Origin-Opener-Policy: same-origin`、
  `Cross-Origin-Resource-Policy`（同源；其他网站可能展示的图片和图标除外），以及关闭
  所有未用到的强大功能的 Permissions-Policy。细节与有据可查的例外见
  [SECURITY.md](SECURITY.md)。
- **SSRF**：服务端抓取任何来自内容或后台的 URL 都经过
  `lib/security/safeFetch.ts`（只允许公网地址，限制大小、跳转次数与时长）。

### 连接 ORCID iD（Connect your ORCID iD）

按 ORCID 的 iD 展示规范：研究者登录 ORCID 证明过的 iD 显示绿色 iD 图标；仅手动填写
的 iD 显示“未认证”iD 图标，并在链接后注明 “(unauthenticated)”（中文页面为
“（未经认证）”）。CV Studio → 个人信息的 iD 字段旁有 **Connect your ORCID iD**，
连接后全站显示为已认证。

1. 登录 [orcid.org](https://orcid.org)（记录需有已验证的邮箱），从账户菜单打开
   **Developer Tools**（<https://orcid.org/developer-tools>），接受 Public API 条款，
   点击 **Register for ORCID Public API credentials**（免费）。名称填网站名，网址填
   网站地址，描述写明用途（ORCID 会在登录页上显示这些信息）。
2. 按网站实际发送的地址添加 redirect URI：`SITE_URL` 的 origin +
   `/api/admin/orcid/callback`，本站即 `https://lucian-dev.com/api/admin/orcid/callback`
   （ORCID 正式环境只接受 https）。
3. 把 **Client ID**（`APP-…`）和 **Client secret** 写入服务器环境变量
   `ORCID_CLIENT_ID`、`ORCID_CLIENT_SECRET` 并重启。想先试用，可在
   <https://sandbox.orcid.org/developer-tools> 注册测试客户端（测试记录；那里接受
   `http://127.0.0.1:3000/api/admin/orcid/callback` 这类 http 地址，同时把 `SITE_URL`
   设为该 origin），并设置 `ORCID_ENV=sandbox`。

工作原理（`lib/orcid/oauth.ts`、`flow.ts`、`connectRoute.ts`）：按钮是指向
`GET /api/admin/orcid/connect` 的普通链接，已登录的管理员被带到 ORCID 的 OAuth 登录页
（授权码模式，仅 `/authenticate` 权限，不能访问记录内容），附带一个与当前管理员会话绑定
的随机 `state`，保存在签名、一次性、10 分钟有效、HttpOnly、`SameSite=Lax`、仅限回调路径的
Cookie 中。ORCID 把浏览器送回 `GET /api/admin/orcid/callback`；管理员会话 Cookie 是
`SameSite=Strict`，这次跨站跳转不会带上它，因此代理放行这一个接口，由接口自行鉴权：
`state` 必须与 Cookie 一致、只能用一次、且发起它的会话仍有效。服务器在 ORCID 的 token
端点用授权码换取结果（secret 从不到达浏览器；请求经 `safeFetch` 只发往 ORCID 一个主机，
不跟随重定向），把确认的 iD 写入两种语言的个人信息并加上标记
`orcidAuthenticated: { id, at }`，记入操作日志，access token 直接丢弃。随后返回一个小页面，
以同源跳转打开 Studio（Strict Cookie 随之恢复）并弹出提示。ORCID 未为该流程提供 PKCE
（其 OpenID 配置没有 `code_challenge_methods_supported`）；机密客户端加会话绑定的
`state` 已覆盖 PKCE 的作用。

标记由服务器掌管：保存时只有 CV 仍带着同一 iD 的该标记才会保留，所以手动改 iD 即变为
未认证（保存前可在 Studio 撤销），在 JSON 里手写的标记会被忽略。**Disconnect** 只移除
标记、保留 iD（显示为未认证）；清空或隐藏字段是普通编辑。公开页面只收到 `{ id }`，且仅在
iD 公开时；PDF、纯文本与 JSON 简历、vCard 和 JSON-LD 始终只写 iD 的 URI。

### 分节可见性

首页所有板块都过一遍 `isSectionVisible(home, key)`，
`key ∈ {introduction, highlights, brands, open-source, tech-stack, activity,
projects, writing, experience, certifications, photos, contact}`。键缺失默认
**显示**——新装实例自带完整页面。带编号的板块按 `home.sectionOrder` 排列，
经 `resolveSectionOrder`（`lib/homeSections.ts`）读取：未知的键被丢弃，旧文档里
缺少的板块插回默认位置，因此旧文档永远不会隐藏某个板块。

入口：**后台 → Home → Sections**（「Recruiter-first」把项目、经历、写作和技能
排到 GitHub 动态之前）。

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
  路由、指标、数值与评级；LCP、INP 与 CLS 另附归因——用本站自己的标记写成的
  元素选择器（标签、id、类名，绝不含文字，最多 120 个字符）和各阶段耗时，由
  Web Vitals 面板按页面与元素汇总（*What makes it slow*）。
- **目标事件**（`POST /api/g`，另有三项由服务器计数）：固定的八个名称，每个
  最多带一个受限的属性——`cv_download`（语言 × 格式；获取 `/cv.pdf` 等文件时
  计数，包括 304 重新验证，不计 HEAD）、`cv_print`（`en` / `zh`）、`vcard_save`
  （服务器）、`email_click`（页面路径，从不记录地址）、`outbound_click`（只记
  目标域名）、`contact_sent`（服务器，只记来意）、`read_through`（读到文末并停留
  了与篇幅相称的时间，只记文章路径）以及 `search_empty`（⌘K 搜索无结果：转小写、
  最多 40 个字符，含 `@` 或 6 个以上数字的一律不保存）。排除规则与访问统计相同；
  唯一的访客值是同一个每日哈希，只能把同一个 UTC 日内的访问与下载关联起来。
  Analytics 标签页显示「目标」「来源 → 简历 → 下载」转化和「无结果的搜索」，以
  「访客·日」计数。
- **存储与保留期**：独立的 `data/analytics.db`（不进入 `content.db`、R2 同步
  或恢复）。原始访问记录保留 35 天，原始 Web Vitals 保留 30 天，原始目标事件
  保留 35 天，按日汇总保留 400 天；`search_empty` 的原始记录和每日汇总都只保留
  35 天。
- `/colophon` 页面公开说明了同样的内容。

**探索数据**（后台 → Analytics）：选择时间段（预设、自定义区间，或用 ‹ › 前后
翻动），打开「Compare」即可在图上叠加上一个同长时段；可按页面、来源、国家、设备、
浏览器或页面语言筛选——从 Filter 选择器添加，或直接点击任意表格行；所有卡片、目标、
转化、「Paths to a goal」以及 Web Vitals（仅按页面与设备）都随之变化，视图保存在
URL 中。筛选依赖原始记录，所以筛选后的视图最多覆盖最近 35 天，并会明确说明；不筛选
时整个时段来自每日汇总。筛选到单个页面会显示该页详情（读到文末、邮件与外链点击、
该页的 Web Vitals），文章编辑器的 ⋯ 菜单也能直接打开。「Export」把当前视图导出为
CSV（单张表，或全部表打包为 .zip——从不包含搜索文字）；开启「Weekly digest」后，
每周一（UTC 01:00）把上周汇总发到 `NOTIFY_EMAIL`，需要配置 SMTP，卡片里写明了设置
方法。不新增任何访客数据；analytics 迁移 7 只增加两个索引和一张按日的页面语言汇总。

---

## CLI 脚本

```bash
yarn content:migrate    # 文件系统 → SQLite（幂等）
yarn content:pull       # R2 → SQLite（覆盖；读 .env）
yarn content:push       # SQLite → R2（覆盖；读 .env）
yarn content:list       # 列出 R2 对象
yarn run check          # tsc + ESLint + 单元测试
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
`127.0.0.1:3002`（Cloudflare Tunnel 从这里接入），用 `./data` 与 `./public/uploads` 的绑定挂载取代
具名卷，并轮转容器日志（`local` 驱动，5 × 10 MB）。基础文件还去掉了全部 Linux
capability、设置 `no-new-privileges` 与进程数上限。根文件系统保持可写：ISR 会改写 `/app/.next/server` 下的预渲染
页面，只读镜像需要把该目录放到每次部署都重新初始化的卷上。页面变成 404 时（删除或
撤回发布的文章与案例研究、没有公开论文的 `/publications`），每次内容写入后及启动时
都会删除它在该目录下的持久化副本（`lib/isrCache`、`lib/isrPages`），否则重启后
Next 会再次提供最后一份 200 副本。生产服务器已迁移过一次——
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
写入 R2 的内容；接着运行 `scripts/static-archive.mjs`（见下）；随后启动服务器和
`scripts/warm-isr.mjs`，用真实数据重新生成所有静态页面（镜像构建时不含数据库）。
`./data` 与 `./public/uploads` 通过卷或绑定挂载持久化。

**保留早先构建的静态资源。** 每次构建的 chunk 文件名都不同，而镜像只带有自己的
`.next/static`。为了让部署前打开的页面（会按需加载 chunk 的已打开标签页，或仍在
边缘缓存里的 HTML）继续正常工作，`landing-static-archive` 卷
（`/app/next-static-archive`）会在启动时收集每次构建的 `/_next/static` 文件，并把
最近一周（`STATIC_ARCHIVE_DAYS`，默认 7 天）部署过的构建的文件复制回新构建旁边——
绝不覆盖新构建自己的文件（所有文件名都是内容哈希或构建 id）。它只存构建产物（每次
构建几 MB），随时可以删除；服务器的覆盖文件必须合并卷列表（不要对 `volumes` 使用
`!override`），示例文件就是这样写的。

运行时配置来自 `.env`（`env_file`）；公开的 `NEXT_PUBLIC_*` 变量同时作为构建
参数传入，因为 Next 会在构建时把它们写进前端代码。

---

## 部署到生产环境

`scripts/deploy.sh` 是唯一的部署方式。它在你的电脑上运行，通过
`ssh vultr_tokyo`（`~/.ssh/config` 中的别名）操作服务器。服务器上没有 GitHub
凭据：新提交以 git bundle 的形式传过去。

```bash
git switch main && git pull && git push   # main == origin/main
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
   本次更新删除、且此后被 `.gitignore` 忽略的文件（移出公开仓库的个人照片）
   在服务器上保留原副本。
4. **构建**：执行 `docker compose build`，旧容器继续提供服务。构建失败时恢复
   检出目录，其余一切未变。
5. **切换**：`docker compose up -d --no-build`，然后等待容器变为 `healthy` 并
   输出 `[warm-isr] regenerated`、`/api/health` 返回 `"status":"ok"`，且端口
   只绑定在 `127.0.0.1`。
6. **清除边缘缓存**：ISR 页面可以被边缘缓存，而上一次构建的 HTML 引用的 chunk
   新镜像里已经没有了。部署脚本在新容器内运行 `scripts/edge-purge.mjs`，用应用
   自己的 `CF_ZONE_ID` + `CF_API_TOKEN`（Cache Purge 权限，令牌不离开服务器）清除
   Cloudflare 区域缓存：先 `purge_everything`；若 Cloudflare 拒绝，则按每批 30 个
   清除所有可缓存的页面、订阅源与站点地图中的 URL。没有凭据（或清除失败）时，
   部署只打印警告并继续：Cloudflare 本来就最多保留 HTML 5 分钟（对共享缓存寿命
   更长的 HTML——`/`、`/about`、`/colophon`——源站会发送
   `Cloudflare-CDN-Cache-Control: max-age=300, stale-if-error=86400`，见
   `lib/edgeHtmlTtl.ts`），而这期间旧 HTML 仍能正常水合，因为早先构建的静态资源
   会被保留（见上文 Docker）。这个上限始终开启，而不仅在没有凭据时：清除可能失败，
   构建时也无法知道运行时的凭据，而每个边缘节点每隔几分钟从 ISR 缓存重新取一次
   几乎没有成本。
7. **冒烟测试**：经 `https://lucian-dev.com` 访问主要页面、订阅源、站点地图、
   健康检查和旧 CV 跳转（带破缓存参数，确保由新的源站响应）；`/` 必须引用新的
   构建 id（`.next/BUILD_ID`）。随后不带查询串再请求 `/`——也就是访客从边缘拿到的
   版本——检查是否也是新构建 id（重试几次）；边缘副本过期只报告、不回滚（源站
   正常，回滚也刷新不了边缘，而且旧副本仍能工作）。
8. **回滚**：切换后任何一步失败都会执行 `docker tag …:pre-<时间戳> …:latest &&
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
目录及以下的 URL 有效；代理只把这一个路径改写到 `/api/indexnow-key`）。两者都是发出即不等待、3 秒
超时、记录日志，且绝不会导致保存失败；未设置环境变量时什么都不发送。每次部署后
也用同一组凭据清除整个区域（`scripts/deploy.sh`、`scripts/edge-purge.mjs`；可用
`docker exec <容器> node scripts/edge-purge.mjs --dry-run` 检查配置），并且 HTML
在边缘最多保留 5 分钟（`Cloudflare-CDN-Cache-Control`，只有 Cloudflare 读取）。

---

## 质量关卡

项目没有托管的 CI：推送到 `main` 之前请在本地运行以下检查。

| 命令 | 必须通过 |
|---|---|
| `yarn run check`、`yarn build`、`node scripts/perf-budget.mjs` | `tsc`、零警告的 ESLint、单元测试、`next build --webpack`，以及性能预算（共享与逐页首屏 JS、共享 CSS、预加载字体的数量与体积） |
| `yarn audit:deps` | `scripts/check-audit.mjs`：生产依赖中不得有高危 / 严重漏洞，除非在 `security/audit-allowlist.json` 中写明理由与到期日；过期条目同样失败 |
| `scripts/check-container.sh` | 合并后的 compose 配置只暴露回环地址，并保留加固项与静态资源归档卷；镜像能构建、在只含 git 种子的全新数据目录上启动、提供服务、预热 ISR 页面，以 uid 1001 运行、没有任何 capability 且 `NoNewPrivs` 为 1；针对该容器运行的 Playwright + axe 测试在 Chromium（桌面、平板、手机、减少动态效果）与 WebKit（iPhone）中全部通过，随后是 `@admin` 用例（使用一次性的管理员账号；Firefox 与视觉基线在 `scripts/check-fixture-gates.sh` 中运行）；8 秒内优雅停止。需要 Docker、`jq` 与 `curl`；修改 Dockerfile、`docker-entrypoint.sh` 或 compose 文件时必须运行，`--no-e2e` 可跳过端到端测试 |
| `scripts/check-fixture-gates.sh` | 在固定版本的 Playwright 镜像（视觉基线即在其中生成）中构建并运行合成测试数据（`e2e/fixtures/store`：*Example Person* 与程序生成的图片，绝不取自线上内容）：在校准过的手机配置下 CLS ≤ 0.05、TBT ≤ 200 ms；Chromium、WebKit（iPhone）与 Firefox 在 375 / 768 / 1440 下无横向滚动；图片不超过 200 KB；文章页 axe 检查；以及首页、文章、案例、简历与联系页（深 / 浅色 × 手机 / 平板 / 桌面）的视觉基线。`--update-snapshots` 在有意的改动后重新生成基线 |

要针对其他服务器运行测试，把 `E2E_BASE_URL` 指向它（本地 `yarn start` 监听
`http://127.0.0.1:3002`；默认值为 `http://127.0.0.1:3000`）。`@admin` 用例从环境
变量 `ADMIN_EMAIL` / `ADMIN_PASS` 读取登录信息（`yarn e2e` 不会读取 `.env`），
缺少时会被跳过；它们会修改内容，因此除一次性的数据存储外，请用
`--grep-invert @admin` 排除它们。

端到端测试（`e2e/`）在桌面、平板、手机与减少动效四种配置下检查每个公开页面：
恰好一个可见的 `h1`、`lang`（`/cv/zh` 为 `zh-Hans`）、标题与描述、无严重 /
关键级 axe 问题（WCAG 2.0–2.2 A/AA）、无横向滚动、手机上 24 × 24 px 的点击目标
（正文内联链接除外）、减少动效时没有正在播放的动画、主题持久化、⌘K 命令面板和
旧地址跳转——任何控制台错误、未捕获异常或 CSP 违规都会使测试失败。`@admin`
用例（只针对本地容器运行：它们会修改内容）会登录后台，端到端地隐藏并恢复一个 CV 字段，制造两个编辑器
之间的「Changed elsewhere」冲突，打开快捷键面板，并跟踪一条联系留言进入收件箱。

---

## 公开路由

| 路由 | 说明 |
|---|---|
| `/` | 首页 — Hero、成就条，以及按站长顺序排列的各板块（ISR，每小时及保存时更新） |
| `/about` | 身份栏、站长自述与全部展开的双语 CV（ISR，每小时及保存时更新） |
| `/cv` | 可打印的英文 CV（浏览器另存 PDF，`?print=1`） |
| `/cv/zh` | 同一份 CV 的中文版（`/cv?lang=zh` 跳转至此） |
| `/publications` | CV 论文板块的公开页面：引用、链接、摘要、复制 BibTeX / APA、ScholarlyArticle JSON-LD（无公开论文时返回 404） |
| `/work` | 案例研究索引（MDX） |
| `/work/[slug]` | 单篇案例（封面 + 正文） |
| `/blog` | 博客索引 + 标签筛选 + 订阅源链接 |
| `/blog/[slug]` | 单篇博文（语法高亮、目录、可放大的图片） |
| `/now` | 「最近在做什么」（MDX） |
| `/uses` | 工具、硬件、服务清单（MDX） |
| `/contact` | 联系页（ISR）：结构化表单与隐私说明、可用状态、复制按钮、vCard + 二维码 |
| `/colophon` | 本站如何构建、隐私说明、更新日志、部署的提交 |
| `/feed.xml`、`/work/feed.xml`、`/feed.json` | 全文 RSS（文章、案例）与 JSON Feed |
| `/sitemap.xml` | 站点地图（CV 及已互译的文章、案例含 EN / 中互链） |
| `/llms.txt`、`/llms-full.txt` | 面向语言模型与智能体的索引（llmstxt.org），以及全部已发布文章与案例的 Markdown 全文 |
| `/blog/[slug].md`、`/work/[slug].md` | 已发布文章或案例的 Markdown 版本（规范链接指向网页，`noindex`） |
| `/api/search-index` | 供命令面板使用的公开搜索文档（中英文）与「问问 Lucian」的原文段落 |
| `/api/vcard` | 公开联系方式的 vCard |
| `/api/health` | 健康状态：所有人只看到 `{"status":"ok"\|"empty"\|"degraded"}`；存储、内容、备份时长、待同步的 R2 写入仅对管理员或携带 `Authorization: Bearer <HEALTH_TOKEN>` 的请求返回 |
| `/.well-known/security.txt` | RFC 9116 安全联系方式（公开简历中的邮箱，有效期滚动 180 天；邮箱隐藏时返回 404） |

API 在 `/api/*`；`/api/admin/*` 全部需要鉴权（代理 `proxy.ts` 把关）。

---

## 后台页面（已鉴权）

| 路由 | 用途 |
|---|---|
| `/admin/login` | 登录（**隐蔽**入口：导航无可见链接；走 ⌘K 命令面板或直接输 URL） |
| `/admin/forgot` + `/admin/reset` | 邮件密码重置流程 |
| `/admin` | 状态中心：需要处理的事项、实时计数、各编辑器入口 |
| `/admin/dashboard?tab=home` | HomeEditor — Hero / 成就条 / 板块顺序与可见性 / 品牌 / 照片 / Contact |
| `/admin/about` | 关于页自述（MDX，留空则 /about 不显示自述） |
| `/admin/dashboard?tab=cv` | CV Studio（逐字段显示/隐藏、隐藏项面板、A4 / 网站预览）+ 原始 JSON |
| `/admin/dashboard?tab=versions` | 版本回滚 |
| `/admin/dashboard?tab=storage` | SQLite + R2 清单，手动 Backup / Pull |
| `/admin/dashboard?tab=inbox` | 联系收件箱：文件夹、来意、搜索、星标 / 归档 / 已回复、带中英模板的线程回复、可撤销的删除 |
| `/admin/dashboard?tab=analytics` | 第一方访问量、来源、设备与真实用户 Web Vitals |
| `/admin/blog`、`/admin/blog/edit?slug=…` | 博客管理：草稿、已上线文章的待发布修改、发布检查清单、实时预览、历史、改网址（自动 301/308）、搜索与分享预览 |
| `/admin/work`、`/admin/work/edit?slug=…` | 案例研究管理（同样的工具） |
| `/admin/tags` | 标签与技术栈的重命名、统一写法、合并；内容导出（.zip） |
| `/admin/now`、`/admin/uses` | 单页编辑器 |
| `/admin/db-config` | MongoDB 连接 + 手动备份/恢复 |
| `/admin/security` | 通行密钥、恢复码、"必须使用通行密钥"、已登录浏览器、登录记录 |
| `/admin/system` | 系统健康（版本、磁盘、数据库、备份、恢复演练、近期警告）、`?view=content` 内容健康、`?view=errors` 错误监控（自建，不发给第三方）与 `?view=activity` 操作日志 |

在任意后台页面按 `?` 可查看（并搜索）键盘快捷键。`G` 加字母跳转：`D` 总览、`I` 收件箱、
`R` CV Studio、`E` 首页编辑器、`P` 文章、`O` 案例、`T` 分析、`V` 版本、`F` 存储、`S` 系统、
`L` 操作日志、`Q` 内容健康、`X` 错误、`K` 安全；列表支持 `j` / `k`、`Enter`、`x`，收件箱另有
`r` 回复、`s` 星标、`e` 归档、`u` 未读、`#` 删除、⌘Z 撤销。单键快捷键可在 `?` 面板里关闭。

编辑已上线的文章或案例时，“保存修改”（⌘S）只存为**待发布修改**，访客仍看到已发布版本，
直到点“发布修改…”（附与线上版本的差异对比）；“预览”在真实网址上显示这些修改。网址旁的
“修改…”可以更换网址：旧网址永久跳转，站内链接自动改写。正文下方的“搜索与分享”可设置搜索标题、
语言和“标记为已更新”，并预览谷歌搜索结果与领英、X、WhatsApp、Slack、微信的卡片（微信只显示标题和
通用链接图标）。写作栏提供中英文字数（中日韩按字计）、阅读时间、查找替换（⌘F）、专注模式和打字机滚动。
“后台 → Tags & export”可跨文章重命名或合并标签，并一键把全部内容导出为 Markdown + JSON 的 .zip。


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
