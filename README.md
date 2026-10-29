# 影匣 ReelVault

只收藏，不播放。记录你看过的每一部电影与剧集，带一个完全隐蔽的隐私保险箱。

**仓库**：https://github.com/Risun666/reelvault
**APK 下载**（三选一，均为同一版本）：

| 渠道 | 地址 | 提取码 |
| --- | --- | --- |
| GitHub Releases | https://github.com/Risun666/reelvault/releases/latest | — |
| 百度网盘 | https://pan.baidu.com/s/1JUK0rsdoY91RbHobr2JLlQ?pwd=4wjf | `4wjf` |
| 夸克网盘 | https://pan.quark.cn/s/36d68dbdb221 | — |

`app-release.apk` 约 2.9MB，安装时允许「未知来源」即可。App 内「设置 → 检查更新」也能直接跳这三个渠道。

- 前端：React 18 + TypeScript + Vite + Tailwind
- 数据：IndexedDB（本地优先），**不联网、不上传**，数据只在本机
- 更新：内置检查更新，对比 GitHub Releases 版本号
- 移动端：PWA（可添加到主屏幕）+ Capacitor 打包 Android APK

## 主要模块

| 模块 | 说明 |
| --- | --- |
| 片库 | 影片 / 演员双栏切换，状态分栏、标签筛选、评分排序 |
| 演员 | 手动添加，或从片库演员表一键生成；可上传头像、写备注、关联影片 |
| 隐私保险箱 | 独立数据区 + PIN，与公开区**物理隔离**（含演员、片单） |
| 片单合集 | 豆瓣式自定义片单，支持排序与自定义封面 |
| 发现 | TMDB 搜索、本周热门、高分榜、个人年度排行 |
| 统计 | 年度小结、状态分布、评分分布、类型偏好 |

## 隐私区的隔离边界

公开区与隐私区在 IndexedDB 里是**两套独立的表**，不存在任何共享查询：

| 数据 | 公开区 | 隐私区 |
| --- | --- | --- |
| 影片 | `titles` | `vtitles` |
| 封面/头像 | `posters` / `avatars` | `vposters` / `vavatars` |
| 元数据（含 PIN） | `meta` | `vmeta` |
| 演员 | `people` | `vpeople` |

演员按区分表存储，公开区的演员栏目里看不到隐私区的任何演员，反之亦然；
清空公开片库不会动到隐私区的一行数据。

## 番号刮削（可选）

隐私空间里添加影片时，可以只输番号自动带出标题、封面、演员、片商、发行日。

浏览器有跨域限制，抓不了数据源站点，所以抓取跑在**你自己部署的代理**里：

```bash
node workers/jav-proxy.mjs          # 默认 8787 端口，零依赖
curl "http://localhost:8787/?code=SSNI-589"
```

Cloudflare Workers 版见 `workers/jav-worker.js` + `wrangler-jav.toml`（请绑自定义域名）。

- 接口：`GET /?code=<番号>[&src=auto|javdb|dmm]`，返回 JSON 元数据
- 数据源：`javdb`（通用）、`dmm`（含剧情简介，需代理部署在日本/海外）
- 可选设 `JAV_TOKEN` 环境变量做访问控制
- **只取元数据**（番號/标题/封面/演员/片商等），不含任何下载或播放链接
- ⚠️ 启用后你输入的番号会发往所填地址，请只填自己的服务

## 本地开发

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 产物在 dist/
npm run typecheck
```

## 国内访问 TMDB

发现页 / 封面拉取走 TMDB，大陆网络下偶尔不通。App 内置了三层兜底，一般不用手动折腾：

1. **默认用官方短域名** `https://api.tmdb.org/3`（`themoviedb.org` 这组域名在大陆被干扰得多得多）
2. **自动降级**：一个节点 1.8 秒没响应就并行打下一个，Key 无效/限流这类错误不重试
3. **海报域名兜底**：`image.tmdb.org` 加载失败会自动换 `image.themoviedb.org` 再试一次

还是不行的话，去「设置 → 数据来源」点 **测速并择优**，App 会并发测所有候选节点并显示延迟，自动切到最快那个。

### 自建反代（候选节点全不可达时）

`workers/` 下有两个现成脚本：

| 脚本 | 适合 | 部署 |
| --- | --- | --- |
| `workers/tmdb-proxy.js` | Cloudflare 免费额度 | `cd workers && npx wrangler deploy` |
| `workers/node-proxy.mjs` | 境外 VPS，零依赖 | `node workers/node-proxy.mjs` |

部署完把「设置 → 数据来源 → 自建反代 / 手动指定地址」里填成：

- API 地址：`https://<你的域名>/3`
- 图片地址：`https://<你的域名>/t/p`

> 两个脚本都只放行 `/3/` 和 `/t/p/`，且只转发到 TMDB 官方域名，不会被当开放代理滥用。
> Cloudflare 的 `*.workers.dev` 在大陆同样不稳，**一定要绑自己的域名**。

## 打包 Android APK

仓库里已包含 `android/` 原生工程与 GitHub Actions 工作流，本地**不需要** Android SDK。

### 方式一：云端构建（推荐）

推送到 GitHub 后，`.github/workflows/android-apk.yml` 会自动：

1. 装依赖 → 类型检查 → 构建前端
2. `npx cap sync android` 把 `dist/` 灌进原生工程
3. `./gradlew assembleDebug` 产出 APK
4. 上传为 Actions 产物（`reelvault-debug`）

打 tag（`git tag v1.0.0 && git push --tags`）会额外构建签名 Release 版并发布到 Releases 页面。
也可以在 Actions 页面手动触发，勾选 `release` 输入项。

### 方式二：本机构建

需要 JDK 17+ 与 Android SDK（platform 34 / build-tools 34）。

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

### 常用命令

```bash
npx cap sync android      # 前端产物 + 插件同步进原生工程
npx cap open android      # 用 Android Studio 打开
npx cap copy android      # 只拷贝前端产物
```

## 已知平台边界

- **保险箱 PIN** 依赖 WebCrypto，必须在安全上下文（`https://` 或 `localhost`）下运行。Capacitor 默认以 `https://localhost` 提供服务，APK 内可正常使用。
- **检查更新**会访问 `api.github.com`（连不上时自动试公开镜像）。若全部不通，界面仍会列出三个下载渠道，可直接手动前往。
- Debug APK 使用自动生成的调试签名，手机上需允许「未知来源」安装。

## 目录速览

```
src/
  lib/        数据层（db / crypto / sync / tmdb / backup）
  store/      zustand 状态（zone / collections / auth / theme / settings）
  pages/      路由页面
  components/ 通用 UI
scripts/      冒烟测试（dataSmoke / uiSmoke）
android/      Capacitor 原生工程
```
