package com.reelvault.app;

import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import java.io.File;

/**
 * 影匣主 Activity。
 *
 * 隐私相关的安全窗口（FLAG_SECURE）与多任务标签逻辑放在 ReelVaultPlugin 里，
 * 因为 Capacitor 的 BridgeActivity 把 onResume/onPause/onDestroy 声明为 final，
 * 子类无法覆盖；插件侧有对应的 handleOnResume/handleOnPause 生命周期钩子可用。
 */
public class MainActivity extends BridgeActivity {

    /**
     * 版本变更时清理 WebView 的磁盘缓存（HTTP 缓存 / Code Cache / GPUCache 等）。
     * WebView 对 https://localhost 的响应有磁盘缓存，升级 APK 后资源 URL 未变时
     * 有概率继续命中旧缓存、加载旧 JS，表现为“装了新版界面没变化”。
     * 只删缓存命名目录，绝不触碰 IndexedDB / Local Storage 等用户数据；
     * 仅在 versionCode 变化的那次启动执行一次，全部包 try/catch 兜底。
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        try {
            SharedPreferences prefs = getSharedPreferences("rv_native", MODE_PRIVATE);
            int last = prefs.getInt("lastVersionCode", 0);
            int now = 0;
            try {
                PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
                now = info.versionCode;
            } catch (Exception ignored) {
            }
            if (last != now) {
                prefs.edit().putInt("lastVersionCode", now).apply();
                purgeWebViewCaches(new File(getApplicationInfo().dataDir, "app_webview"), 0);
            }
        } catch (Throwable ignored) {
            // 任何异常都不阻断启动
        }
        super.onCreate(savedInstanceState);
    }

    /** 递归删除名字含 cache 的目录/文件，以及 Service Worker 目录；深度限制防失控 */
    private static void purgeWebViewCaches(File dir, int depth) {
        if (dir == null || !dir.exists() || depth > 4) return;
        File[] children = dir.listFiles();
        if (children == null) return;
        for (File f : children) {
            String name = f.getName().toLowerCase();
            boolean isCache = name.contains("cache");
            boolean isServiceWorker = name.equals("service worker");
            if (isCache || isServiceWorker) {
                deleteRecursively(f);
            } else if (f.isDirectory()) {
                purgeWebViewCaches(f, depth + 1);
            }
        }
    }

    private static void deleteRecursively(File f) {
        File[] children = f.listFiles();
        if (children != null) {
            for (File c : children) deleteRecursively(c);
        }
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }
}
