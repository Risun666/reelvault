import { webview } from '@kit.ArkWeb';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { promptAction } from '@kit.ArkUI';
import { request } from '@kit.BasicServicesKit';

const TAG: string = 'ReelVaultIndex';

/**
 * 影匣 ReelVault · HarmonyOS 壳页面
 * ArkWeb 加载打包在 rawfile 里的 Vite 产物（npm run harmony:sync 同步 dist）。
 * - domStorageAccess / databaseAccess：IndexedDB 与 localStorage（应用数据全在本地）
 * - fileAccess + resource：读取 rawfile 静态资源
 * - onDownloadStart：设置页「备份导出」的下载兜底（blob 暂不支持，见 harmony/README.md）
 */
@Entry
@Component
struct Index {
  controller: webview.WebviewController = new webview.WebviewController();

  private async handleDownload(url: string, userAgent: string, contentDisposition: string,
    mimetype: string, contentLength: number): Promise<void> => {
    // <a download> 的 blob: URL 无法交给系统下载器，提示用户走手动路径
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      promptAction.showToast({ message: '鸿蒙版暂不支持直接导出文件，可长按文本复制或使用网页版导出', duration: 3500 });
      return;
    }
    try {
      const fileName: string = url.split('/').pop()?.split('?')[0] || 'reelvault-download';
      const task = await request.agent.create({
        url: url,
        header: { 'User-Agent': userAgent },
        mode: 'background',
        action: request.agent.Action.KEEP,
        description: 'ReelVault 下载',
        fileName: fileName,
        mimeType: mimetype && mimetype.length > 0 ? mimetype : 'application/octet-stream'
      });
      promptAction.showToast({ message: `已开始下载 ${fileName}`, duration: 2000 });
      task.on('completed', () => {
        promptAction.showToast({ message: '下载完成，可在「文件管理 · Download」中查看', duration: 3000 });
      });
      task.on('failed', () => {
        promptAction.showToast({ message: '下载失败，请检查网络', duration: 2500 });
      });
    } catch (e) {
      hilog.error(0x0000, TAG, 'download failed: %{public}s', JSON.stringify(e));
      promptAction.showToast({ message: '下载失败', duration: 2000 });
    }
  }

  build() {
    Column() {
      Web({ src: $rawfile('index.html'), controller: this.controller })
        .width('100%')
        .layoutWeight(1)
        .domStorageAccess(true)
        .databaseAccess(true)
        .fileAccess(true)
        .javaScriptAccess(true)
        .zoomAccess(false)
        .mixedMode(MixedMode.All)
        .darkMode(WebDarkMode.Auto)
        .forceDarkAccess(false)
        .onPageEnd(() => {
          hilog.info(0x0000, TAG, 'page loaded');
        })
        .onDownloadStart((event) => {
          if (event) {
            this.handleDownload(event.url, event.userAgent,
              event.contentDisposition, event.mimetype, event.contentLength);
          }
        })
        .onErrorReceive((event) => {
          if (event) {
            hilog.error(0x0000, TAG, 'web error: %{public}s', JSON.stringify(event.error.getErrorInfo()));
          }
        })
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#F7F4EF')
  }
}
