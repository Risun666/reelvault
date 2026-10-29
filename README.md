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

隐私空间里添加影片时，只输番号就能带出标题、封面、演员、片商、系列、发行日、时长、评分。
思路参考 AVDC 与 OpenAver：**多数据源逐个尝试 + 只填空字段**，谁先有谁填。

浏览器有跨域限制，抓不了数据源站点，所以抓取跑在**你自己部署的服务**里：

```bash
node workers/jav-proxy.mjs                     # 零依赖，默认 8787 端口
curl "http://localhost:8787/scrape?code=SSNI-589"
curl "http://localhost:8787/health"

node scripts/jav-smoke.mjs SSNI-589            # 不经服务，直接自检链路
```

Cloudflare Workers 版见 `workers/jav-worker.js` + `wrangler-jav.toml`（请绑自定义域名）。

### 内置代理后端

| 数据源 | 说明 | 部署节点要求 |
| --- | --- | --- |
| `javdb` | 数据最全：标题（含中译）、封面、演员、片商、系列、导演、类别、时长、评分 | 境内可直连 |
| `jav321` | 封面走 DMM 图床 | 境内可直连 |
| `dmm` | **唯一有日文简介**的一家 | 日本 / 海外 |
| `avsox` | 备用 | 海外 |
| `mgstage` | 素人番号命中率高 | 海外 |
| `fc2` | FC2 番号专用 | 海外 |

- 默认链路 `javdb → jav321 → dmm → avsox → mgstage → fc2`，拿到 JavDB 就收工（省对方站点资源）
- 想要简介就在设置里开「补全简介」，会再问 DMM 等站补齐
- 番号写法随便输：`SSNI-589` / `ssni589` / `ssni00589` / `FC2-PPV-1234567` / `259LUXU-1111`，
  直接粘贴文件名也行（`[abc] SSNI-589 三上悠亜.mp4` 会自动抠出番号）

### MetaTube 后端

想覆盖无码 / 小众片商，可以把后端换成 [MetaTube](https://github.com/metatube-community/metatube-sdk-go)
（自带 20+ 家 provider）：

```bash
docker run -d -p 8080:8080 metatube/metatube     # 具体镜像名以它的文档为准
METATUBE_URL=http://127.0.0.1:8080 node workers/jav-proxy.mjs
```

设置里后端选「MetaTube」并填地址即可，App 会自动走它的
`/v1/movies/search` + `/v1/movies/{provider}/{id}` + `/v1/images/primary/{provider}/{id}`。

### 接口

```
GET /scrape?code=SSNI-589&src=javdb,jav321&enrich=1   → 统一格式的元数据
GET /image?url=<图床直链>                              → 图片字节（带 CORS，供 App 存本地）
GET /sources                                          → 数据源清单
GET /providers                                        → MetaTube 后端的 provider 列表
GET /health
```

- 可选设 `JAV_TOKEN` / `METATUBE_TOKEN` 做访问控制
- 图床链接默认经 `/image` 代理下载后存本地，离线可看
- **只取元数据**，不含任何下载或播放链接
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
4. **启动时自动择优**：每天第一次打开会并发测一遍接口节点与图片 CDN，自动切到最快的那个

还是不行的话，去「设置 → 数据来源」点 **诊断并择优**，页面上会分别告诉你：
API Key 是有效 / 已被限流 / 已失效、接口节点通不通、图片 CDN 通不通。

### API Key

- 默认使用**内置 Key**，开箱即用；它是共享的，被别人用多了会限流，也随时可能被吊销
- 想稳定就自己在 themoviedb.org 申请一个（免费），在设置里关掉「使用内置 API Key」后填入
- 无论用哪个 Key，请求结果都会缓存 5 分钟，既是省额度也是让页面切换更快

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

### 签名与覆盖安装

Android 只有同时满足下面三点，才允许直接覆盖安装（不用先卸载）：

1. **包名一致** —— `applicationId` 恒为 `com.reelvault.app`
2. **签名一致** —— 每次构建使用同一把密钥
3. **版本号不降低** —— `versionCode` 递增（仓库里唯一来源是 `android/app/build.gradle`）

云端构建时签名密钥的来源按优先级自动选择：

| 优先级 | 来源 | 说明 |
| --- | --- | --- |
| 1 | 仓库 Secrets | 最稳，见下方配置步骤 |
| 2 | 仓库内 `keystore/reelvault.jks` | 零配置，但公开仓库等于密钥公开 |
| 3 | Actions 缓存 | 7 天不构建会被 GitHub 清理 |
| 4 | 现场临时生成 | 每次签名都不同，**必须卸载旧版再装** |

#### 固定签名（推荐）

1. 生成一次密钥（本机已生成好的在 `releases/reelvault.jks`）：

   ```bash
   keytool -genkeypair -v -keystore reelvault.jks -storetype PKCS12 \
     -keyalg RSA -keysize 2048 -validity 10950 -sigalg SHA256withRSA \
     -alias reelvault -storepass reelvault -keypass reelvault \
     -dname "CN=ReelVault, OU=ReelVault, O=ReelVault, L=Beijing, ST=Beijing, C=CN"
   base64 -w0 reelvault.jks > reelvault.jks.b64
   ```

2. 到仓库 **Settings → Secrets and variables → Actions → New repository secret**，依次添加四个：

   | Name | Value |
   | --- | --- |
   | `ANDROID_KEYSTORE_BASE64` | `reelvault.jks.b64` 的全部内容（单行） |
   | `ANDROID_KEYSTORE_PASSWORD` | `reelvault` |
   | `ANDROID_KEY_ALIAS` | `reelvault` |
   | `ANDROID_KEY_PASSWORD` | `reelvault` |

3. 之后每次构建都用同一把密钥，装新版本时直接点击安装即可覆盖，数据不会丢。

密钥一旦丢失就无法再升级（只能卸载重装并丢失本地数据），务必备份好 `reelvault.jks`。
构建日志的 Job Summary 会打印本次签名来源与 SHA256 指纹，可用于核对是否一致。

## 已知平台边界

- **保险箱 PIN** 依赖 WebCrypto，必须在安全上下文（`https://` 或 `localhost`）下运行。Capacitor 默认以 `https://localhost` 提供服务，APK 内可正常使用。
- **检查更新**会访问 `api.github.com`（连不上时自动试公开镜像）。若全部不通，界面仍会列出三个下载渠道，可直接手动前往。
- 手机上需允许「未知来源」才能安装本 APK。配置了固定签名密钥后新旧版本可直接覆盖安装，详见上文「签名与覆盖安装」。

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
