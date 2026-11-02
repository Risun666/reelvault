package com.reelvault.app;

import com.getcapacitor.BridgeActivity;

import android.app.ActivityManager;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;

/**
 * 影匣主 Activity。
 *
 * 隐私相关：当隐私保险箱处于解锁状态时，给窗口加上 FLAG_SECURE，使系统多任务预览、
 * 截屏都无法捕捉到保险箱内容；进入后台（onPause）时若保险箱曾解锁则强制保持安全窗，
 * 因此后台任务栏里的快照是空白的，外界看不到保险箱内任何内容。
 */
public class MainActivity extends BridgeActivity {

  /** 是否处于「保险箱已解锁」状态，由 JS 通过插件 setSecure 同步 */
  private static boolean vaultActive = false;
  private static MainActivity instance;

  public static void setVaultActive(boolean active) {
    vaultActive = active;
    if (instance != null) instance.applySecure();
  }

  public static void setTaskLabel(String label) {
    if (instance == null || label == null) return;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      instance.setTaskDescription(new ActivityManager.TaskDescription(label));
    }
  }

  private void applySecure() {
    if (vaultActive) {
      getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    } else {
      getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }
  }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    instance = this;
  }

  @Override
  protected void onResume() {
    super.onResume();
    if (instance == null) instance = this;
    applySecure();
  }

  @Override
  protected void onPause() {
    // 进入后台：只要保险箱曾解锁，就确保开启安全窗，多任务快照留白（隐私模式）
    if (vaultActive) {
      getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }
    super.onPause();
  }

  @Override
  protected void onDestroy() {
    if (instance == this) instance = null;
    super.onDestroy();
  }
}
