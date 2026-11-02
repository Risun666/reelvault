package com.reelvault.app;

import com.getcapacitor.BridgeActivity;

/**
 * 影匣主 Activity。
 *
 * 隐私相关的安全窗口（FLAG_SECURE）与多任务标签逻辑放在 ReelVaultPlugin 里，
 * 因为 Capacitor 的 BridgeActivity 把 onResume/onPause/onDestroy 声明为 final，
 * 子类无法覆盖；插件侧有对应的 handleOnResume/handleOnPause 生命周期钩子可用。
 */
public class MainActivity extends BridgeActivity {}
