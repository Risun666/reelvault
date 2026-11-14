"""ReelVault v1.4.7 整树推送：blobs(增量) -> 全量 tree -> commit -> PATCH main -> tag
经验：Python 调 curl 最稳（urllib 不吃代理）；判定成败只看 http_code；大 payload 走 @file
"""
import json
import os
import subprocess
import sys
import time

REPO = 'Risun666/reelvault'
ROOT = r'C:/Users/DELL/WorkBuddy/2026-10-28-20-11-18'
API = 'https://api.github.com'
TMP = os.path.join(ROOT, '.push-tmp.json')

def gh(method, api, payload=None, expect=('200', '201', '204'), retry=5):
    args = ['curl', '-s', '-X', method,
            '-H', f'Authorization: Bearer {os.environ["GH_TOKEN"]}',
            '-H', 'Accept: application/vnd.github+json',
            '-w', '\n%{http_code}']
    if payload is not None:
        with open(TMP, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False)
        args += ['-H', 'Content-Type: application/json', '--data', '@' + TMP]
    args += [f'{API}{api}']
    for i in range(retry):
        out = subprocess.run(args, capture_output=True, text=True).stdout
        body, _, code = out.rpartition('\n')
        code = code.strip()
        if code in expect:
            try:
                return json.loads(body) if body.strip() else {}
            except json.JSONDecodeError:
                pass  # 200 但响应体空/坏：重试
        print(f'  retry {i+1}: {method} {api} -> {code}', flush=True)
        time.sleep(min(2 ** i, 10))
    raise RuntimeError(f'gh failed: {method} {api} -> {code}')

# ---------- 0. 远端 main HEAD 与 tree ----------
head = gh('GET', f'/repos/{REPO}/git/ref/heads/main')
parent = head['object']['sha']
print('remote main:', parent)
commit = gh('GET', f'/repos/{REPO}/git/commits/{parent}')
rt = gh('GET', f'/repos/{REPO}/git/trees/{commit["tree"]["sha"]}?recursive=1')
remote = {e['path']: (e['sha'], e['mode']) for e in rt.get('tree', []) if e['type'] == 'blob'}
print('remote blobs:', len(remote), 'truncated:', rt.get('truncated'))

# ---------- 1. 本地文件清单（跟踪 + 未忽略的新文件） ----------
out = subprocess.run(['git', 'ls-files', '-s'], cwd=ROOT, capture_output=True, text=True).stdout
entries = []  # (mode, path)
for line in out.splitlines():
    meta, path = line.split('\t', 1)
    mode = meta.split()[0]
    entries.append((mode, path))
out = subprocess.run(['git', 'ls-files', '--others', '--exclude-standard'], cwd=ROOT,
                     capture_output=True, text=True).stdout
for path in out.splitlines():
    entries.append(('100644', path))
print('local files:', len(entries))

# ---------- 2. 增量上传变化的 blob ----------
import base64
import hashlib

def norm(content: bytes) -> bytes:
    """与 git 仓库一致：文本统一 LF（含 NUL 视为二进制不动）"""
    if b'\0' in content:
        return content
    return content.replace(b'\r\n', b'\n')

def blob_sha(content: bytes) -> str:
    h = hashlib.sha1()
    h.update(b'blob %d\0' % len(content))
    h.update(content)
    return h.hexdigest()

tree_entries = []
uploaded = reused = 0
for mode, path in entries:
    local = os.path.join(ROOT, path)
    with open(local, 'rb') as f:
        content = norm(f.read())
    sha = blob_sha(content)
    if path in remote and remote[path][0] == sha:
        tree_entries.append({'path': path, 'mode': remote[path][1], 'type': 'blob', 'sha': sha})
        reused += 1
        continue
    b64 = base64.b64encode(content).decode()
    r = gh('POST', f'/repos/{REPO}/git/blobs', {'content': b64, 'encoding': 'base64'})
    assert r['sha'] == sha, f'blob sha mismatch: {path}'
    tree_entries.append({'path': path, 'mode': mode, 'type': 'blob', 'sha': r['sha']})
    uploaded += 1
    print('  +', path, flush=True)
print(f'blobs: uploaded {uploaded}, reused {reused}')

# ---------- 3. 全量新 tree（不带 base_tree） ----------
r = gh('POST', f'/repos/{REPO}/git/trees', {'tree': tree_entries})
tree_sha = r['sha']
print('tree:', tree_sha)

# ---------- 4. commit（以远端 main 为父） ----------
MSG = '''v1.4.7：片库 3D 全息卡牌轮播重做 + 鸿蒙 HarmonyOS 版

- 片库书架视图重写为沉浸式 Coverflow 轮播：中央大卡 + 两侧扇形倾斜侧卡、
  全息光泽扫动、逐张 snap 翻页、页码指示
- 底部详情自动跟随居中卡：标题/年份/类型/状态/进度/评分 + 快速标记 + 详情按钮
- 智能排序：在看 C 位、弃坑压暗沉底；长按快捷操作保留
- 新增 HarmonyOS NEXT（ArkWeb）壳工程 harmony/：npm run harmony:sync 同步产物，
  DevEco Studio 打开即可构建签名 HAP（v1.4.7 / versionCode 14）
- 一并入库 v1.4.5/1.4.6 遗留：备份导出原生分流（filesystem+share）、
  WebView 升级缓存自动清理、书架视图迁移'''
r = gh('POST', f'/repos/{REPO}/git/commits', {'message': MSG, 'tree': tree_sha, 'parents': [parent]})
commit_sha = r['sha']
print('commit:', commit_sha)

# ---------- 5. 推进 main ----------
gh('PATCH', f'/repos/{REPO}/git/refs/heads/main', {'sha': commit_sha, 'force': False})
print('main updated')

# ---------- 6. tag v1.4.7（触发 CI 构建 APK） ----------
r = gh('POST', f'/repos/{REPO}/git/tags', {'tag': 'v1.4.7', 'message': 'v1.4.7', 'object': commit_sha, 'type': 'commit'})
gh('POST', f'/repos/{REPO}/git/refs', {'ref': 'refs/tags/v1.4.7', 'sha': r['sha']})
print('tag v1.4.7 created')

if os.path.exists(TMP):
    os.remove(TMP)
print('ALL DONE')
