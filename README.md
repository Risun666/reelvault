# 影匣 ReelVault

只收藏，不播放。记录你看过的每一部电影与剧集，带一个完全隐蔽的隐私保险箱。

- 前端：React 18 + TypeScript + Vite + Tailwind
- 数据：IndexedDB（本地优先），隐私区与主库物理隔离
- 云同步：WorkBuddy Cloud（登录后才启用，隐私区永不上云）
- 移动端：PWA（可添加到主屏幕）+ Capacitor 打包 Android APK

## 本地开发

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 产物在 dist/
npm run typecheck
```

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
- **云同步登录**走 OAuth 回调，回调地址指向已发布的 HTTPS 域名。在 APK 内登录可能无法正常回跳，请以 PWA / 网页版为准；本地片库与保险箱功能不受影响。
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
