# 云端部署

这个项目已准备好部署到 Render。部署完成后，网站由云端运行，电脑关机也不影响访问。

## 需要准备

需要一个 GitHub 账号和一个 Render 账号。当前项目不是 Git 仓库，所以需要先把本目录上传到一个 GitHub 仓库；上传时只包含本项目文件，不要上传 `.codex`、日志或 `tools/cloudflared.exe`。

## Render 设置

在 Render 新建 **Web Service**，连接这个 GitHub 仓库。仓库根目录里的 `render.yaml` 会提供默认配置：

- Runtime：Python
- Build Command：`python -m compileall app.py lexicon.py`
- Start Command：`python -X utf8 app.py`
- Health Check Path：`/api/health`
- Plan：Free

Render 会自动注入 `PORT`，应用已经监听 `0.0.0.0` 并使用该端口。部署完成后，Render 会分配一个 `onrender.com` HTTPS 地址。

## 部署包内容

`data/dictionary.sqlite3` 是已经生成的词典索引，约 55 MB；`data/neccs.csv` 是题库。云端启动时不需要安装本机的 explain-vocabulary 技能，也不依赖 `VOCAB_SKILL_DIR`。

网站仍保留词典来源说明、补充笔记说明和题库边界说明。词典数据的第三方公开分发权需要由部署者自行确认；上游项目声明 MIT 许可，但这不等同于第三方词典内容获得独立授权。

## 维护

Render 免费实例在一段时间无访问后可能休眠，首次打开会有冷启动延迟；它不是永久在线保证。更新网站时，向 GitHub 推送新提交，Render 会自动重新部署。
