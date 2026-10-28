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
