# 临时分享词间

当前分享网址：https://holmes-innocent-preparing-instantly.trycloudflare.com

该地址已通过 Cloudflare Quick Tunnel 连接到本机的 Wordroom 服务。
任何拿到链接的人均可打开网页查词，无需安装 Python 或填写密钥。

## 日常使用

1. 保持本机开机、联网，避免睡眠或休眠。
2. 把当前网址发给需要使用的人。
3. 关机重启后，双击 `开启分享.cmd`；它会启动词典和分享连接，并打开新的网址。
4. 最新网址会写入 `data/share-url.txt`。重新建立分享连接后，网址通常会改变；本文件顶部记录的旧网址将失效。

关闭浏览器或启动脚本的窗口不会关闭后台服务。电脑关机、休眠、断网或分享进程退出时，网页可能无法访问。
Cloudflare Quick Tunnel 没有可用性保证，适合临时试用；长期使用需要账户和固定托管。

每位访客的生词本只保存在自己的浏览器中。网址改变会形成新的浏览器存储空间，旧生词本不会自动迁移；需要保留时请在旧网址仍可用时导出。

## 配置

- 本机服务：`http://127.0.0.1:8766`，仅监听回环地址。
- 分享工具：官方 Cloudflare `cloudflared`，版本 `2026.10.2`。
- 可执行文件：`tools/cloudflared.exe`。
- 下载来源：https://github.com/cloudflare/cloudflared/releases/tag/2026.10.2
- 已校验 SHA256：`12c7c887f8aaab779aef1dfa9b60673530a5adb88ecc55dd6df8f56e0b70f199`。
- 连接进程编号记录在 `data/tunnel.pid`；连接日志为 `data/tunnel-stderr.log`。
- 分享范围为此网站现有页面和查词 API；网站没有文件浏览或远程命令接口。

## 数据来源

词典与题库沿用已安装的 explain-vocabulary 技能，没有改变原有的数据范围。
上游仓库：https://github.com/DURUII/english-learning-skills 。
上游仓库声明 MIT 许可；这不构成第三方词典内容获得独立公开分发许可的确认。
