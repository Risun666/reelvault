package com.reelvault.app;

import android.app.ActivityManager;
import android.app.DownloadManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * 影匣专用原生能力：
 * 1) setSecure / setTaskLabel —— 隐私保险箱相关的安全窗口与多任务标签
 * 2) downloadApk —— 系统下载管理器后台下载 APK，完成后自动弹出安装
 *
 * 安全窗口逻辑放在这里而非 MainActivity，是因为 BridgeActivity 的生命周期方法是 final，
 * 无法在子类中覆盖；插件有 handleOnResume / handleOnPause 钩子可用。
 */
@CapacitorPlugin(name = "ReelVault")
public class ReelVaultPlugin extends Plugin {

  private static final String CHANNEL_ID = "reelvault_updates";
  private static final int NOTIFY_ID = 4231;

  /** 是否处于「保险箱已解锁」状态，由 JS 通过 setSecure 同步 */
  private static boolean vaultActive = false;
  private static ReelVaultPlugin instance;

  private long downloadId = -1;
  private Handler pollHandler;
  private Runnable pollTask;
  private BroadcastReceiver completeReceiver;
  private boolean receiverRegistered = false;
  private int iconRes = 0;

  public static void setVaultActive(boolean active) {
    vaultActive = active;
    if (instance != null) instance.applySecure();
  }

  public static void setTaskLabel(String label) {
    if (instance == null || label == null) return;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      instance.getActivity().setTaskDescription(new ActivityManager.TaskDescription(label));
    }
  }

  private void applySecure() {
    if (getActivity() == null) return;
    if (vaultActive) {
      getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    } else {
      getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }
  }

  @Override
  public void load() {
    super.load();
    instance = this;
    if (completeReceiver == null) {
      completeReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
          if (DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) {
            long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
            if (id == downloadId) {
              stopPolling();
              onDownloadFinished(context);
            }
          }
        }
      };
    }
    if (!receiverRegistered) {
      IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        getContext().registerReceiver(completeReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
      } else {
        getContext().registerReceiver(completeReceiver, filter);
      }
      receiverRegistered = true;
    }
  }

  @Override
  public void handleOnResume() {
    super.handleOnResume();
    applySecure();
  }

  @Override
  public void handleOnPause() {
    super.handleOnPause();
    // 进入后台：只要保险箱曾解锁，就确保开启安全窗，多任务快照留白（隐私模式）
    if (vaultActive) {
      getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }
  }

  @Override
  public void handleOnDestroy() {
    super.handleOnDestroy();
    stopPolling();
    if (receiverRegistered && completeReceiver != null) {
      try {
        getContext().unregisterReceiver(completeReceiver);
      } catch (Exception ignored) {
        // 已注销或 context 失效，忽略
      }
      receiverRegistered = false;
    }
    if (instance == this) instance = null;
  }

  // ---------- 隐私安全（由 JS 调用） ----------

  @PluginMethod
  public void setSecure(PluginCall call) {
    boolean enabled = call.getBoolean("enabled", false);
    setVaultActive(enabled);
    call.resolve();
  }

  @PluginMethod
  public void setTaskLabel(PluginCall call) {
    String label = call.getString("label", null);
    setTaskLabel(label);
    call.resolve();
  }

  // ---------- App 内下载并安装 ----------

  @PluginMethod
  public void downloadApk(PluginCall call) {
    String url = call.getString("url");
    String title = call.getString("title", "影匣 更新");
    if (url == null || url.isEmpty()) {
      call.reject("缺少下载地址");
      return;
    }
    Context ctx = getContext();
    DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
    DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url))
        .setTitle(title)
        .setDescription("影匣 更新下载中…")
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        .setDestinationInExternalFilesDir(ctx, Environment.DIRECTORY_DOWNLOADS, "reelvault-update.apk")
        .setAllowedOverMetered(true)
        .setAllowedOverRoaming(true);
    downloadId = dm.enqueue(req);
    call.resolve(new JSObject());
    emitProgress("downloading", 0, "已加入系统下载队列");

    startPolling(ctx, dm);
  }

  private void startPolling(Context ctx, DownloadManager dm) {
    stopPolling();
    pollHandler = new Handler(Looper.getMainLooper());
    pollTask = new Runnable() {
      @Override
      public void run() {
        DownloadManager.Query q = new DownloadManager.Query().setFilterById(downloadId);
        android.database.Cursor c = dm.query(q);
        if (c != null) {
          try {
            if (c.moveToFirst()) {
              int status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
              if (status == DownloadManager.STATUS_SUCCESSFUL) {
                stopPolling();
                onDownloadFinished(ctx);
                return;
              }
              if (status == DownloadManager.STATUS_FAILED) {
                stopPolling();
                emitProgress("error", 0, "下载失败，请改用网盘或浏览器下载");
                return;
              }
              long soFar = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
              long total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
              int pct = total > 0 ? (int) (soFar * 100 / total) : 0;
              emitProgress("downloading", pct, "下载中 " + pct + "%");
            }
          } finally {
            c.close();
          }
        }
        pollHandler.postDelayed(this, 500);
      }
    };
    pollHandler.post(pollTask);
  }

  private void stopPolling() {
    if (pollHandler != null && pollTask != null) {
      pollHandler.removeCallbacks(pollTask);
    }
  }

  private void onDownloadFinished(Context ctx) {
    File file = new File(ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "reelvault-update.apk");
    if (!file.exists()) {
      emitProgress("error", 0, "下载文件缺失");
      return;
    }
    Uri apkUri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", file);
    Intent install = new Intent(Intent.ACTION_VIEW);
    install.setDataAndType(apkUri, "application/vnd.android.package-archive");
    install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

    emitProgress("installing", 100, "下载完成，正在请求安装…");

    // 先尝试直接弹出安装；若处于后台被系统拦截，则通过通知的 PendingIntent 兜底
    try {
      ctx.startActivity(install);
    } catch (Exception ignored) {
      // 某些系统/版本在后台禁止直接启动 Activity，落到通知
    }
    postInstallNotification(ctx, install);
  }

  private void postInstallNotification(Context ctx, Intent install) {
    NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationChannel ch = new NotificationChannel(
          CHANNEL_ID, "影匣更新", NotificationManager.IMPORTANCE_HIGH);
      nm.createNotificationChannel(ch);
    }
    PendingIntent pi = PendingIntent.getActivity(
        ctx, 0, install, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    Notification.Builder builder;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      builder = new Notification.Builder(ctx, CHANNEL_ID);
    } else {
      builder = new Notification.Builder(ctx);
    }
    builder.setContentTitle("影匣 更新已就绪")
        .setContentText("点击安装新版本")
        .setSmallIcon(getIconRes())
        .setContentIntent(pi)
        .setAutoCancel(true);
    nm.notify(NOTIFY_ID, builder.build());
  }

  private int getIconRes() {
    if (iconRes == 0) {
      iconRes = getContext().getResources().getIdentifier(
          "ic_launcher", "mipmap", getContext().getPackageName());
      if (iconRes == 0) iconRes = android.R.drawable.sym_def_app_icon;
    }
    return iconRes;
  }

  private void emitProgress(String state, int progress, String message) {
    JSObject o = new JSObject();
    o.put("state", state);
    o.put("progress", progress);
    o.put("message", message);
    notifyListeners("downloadProgress", o);
  }
}
