# 影匣 ReelVault · HarmonyOS 版

鸿蒙版是 **ArkWeb（WebView）壳工程**：Web 内核加载打包在 rawfile 里的 Vite 生产构建产物，应用数据全部存放在 ArkWeb 的 IndexedDB / localStorage 中，离线可用。功能与 Android 版一致（片库 / 发现 / 片单 / 统计 / 隐私保险箱 / 3D 卡牌轮播）。

## 环境要求

- [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/) 5.0.0 及以上（自带 HarmonyOS SDK 与 hvigor）
- Node.js 20+（用于同步 Web 资源）

## 构建步骤

```bash
# 1. 在项目根目录同步 Web 产物到 rawfile（会先自动执行 npm run build）
npm run harmony:sync

# 2. 用 DevEco Studio 打开 harmony/ 目录，等待 hvigor 同步完成

# 3. 自动签名：File > Project Structure > Signing Configs，
#    勾选 "Automatically generate signature"，登录华为开发者账号
#    （签名信息会写入 build-profile.json5 的 signingConfigs）

# 4. Build > Build Hap(s) / 或直接 Run 到真机、模拟器
```

产物位于 `harmony/entry/build/default/outputs/default/*.hap`。

## 版本号

鸿蒙版本号在 `harmony/AppScope/app.json5`（`versionCode` / `versionName`），与 Android 版保持同步。改版本时记得同时改：
- `src/lib/updater.ts` 的 `APP_VERSION`
- `package.json` 的 `version`
- `android/app/build.gradle` 的 `versionCode` / `versionName`

## 已知限制（壳实现的边界）

- **备份导出**：`<a download>` 的 `blob:` 下载在 ArkWeb 内暂不能落盘（壳里已对普通 URL 下载做了兜底）。建议导出备份时使用网页版（浏览器打开 dist），或通过「文件管理」的跨设备传输。
- **Capacitor 原生插件不生效**：`@capacitor/filesystem` / `@capacitor/share` 仅在 Capacitor 壳（Android/iOS）内生效，鸿蒙壳中应用会自动走 Web 兜底路径。
- **Service Worker**：应用内不注册 SW（与 Android 版一致），升级后直接读新包，无需清缓存。

## 目录结构

```
harmony/
├─ AppScope/                 应用级配置与图标
├─ build-profile.json5       工程签名/SDK 版本（自动签名后由 DevEco 维护）
├─ entry/
│  ├─ src/main/
│  │  ├─ ets/
│  │  │  ├─ entryability/    UIAbility（预初始化 Web 内核）
│  │  │  └─ pages/Index.ets  ArkWeb 页面（rawfile 加载 + 下载兜底）
│  │  ├─ resources/base/     图标、字符串、颜色
│  │  └─ module.json5        模块配置（INTERNET 权限）
│  └─ src/main/resources/rawfile/   ← npm run harmony:sync 生成（不进仓库）
└─ scripts 同步：项目根 scripts/sync-harmony.mjs
```
