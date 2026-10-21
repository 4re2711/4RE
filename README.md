# 词间 Wordroom

面向考研、四六级学习者的本地词汇网页，复用 explain-vocabulary 技能的词典与题库。

## 分享给别人

双击 `开启分享.cmd` 生成临时 HTTPS 网址，其他人可以直接打开使用。
当前地址记录在 `data/share-url.txt`。保持电脑开机联网；重新启动分享连接后，网址通常会改变。
详细说明见 `SHARING.md`。

## 打开

双击本目录的 `打开词间.cmd`。它在后台启动本地服务，并在默认浏览器打开
http://127.0.0.1:8766 。已有服务时会直接打开页面。

也可在此目录运行 `python -X utf8 app.py`，然后访问上面的网址。
首次运行会建立本地 SQLite 索引，后续启动复用索引。只绑定 127.0.0.1。
关机后需再次双击启动文件。无需安装第三方 Python 包或 Node 依赖。

## 功能

- 英语单词、短语精确检索，前缀建议、基础变形回退和拼写建议。
- 中英义项、词典例句、搭配与句法结构，以及可展开的完整词典原文。
- 从词典辨析框建立关系索引；常见词另有明确标注的学习笔记。
- 生词收藏、近期检索、生词本 Markdown 导出，存储在当前浏览器中。
- 词汇题库练习，作答后显示答案与解析。
- 调用系统英语语音朗读；没有英语语音包时会显示说明。
- 适配移动窄屏、键盘搜索、方向键选择建议、键盘切换标签页。

## 数据与边界

默认读取 `~/.codex/skills/explain-vocabulary/assets/oald9.csv` 与 `neccs.csv`。
可通过 `VOCAB_SKILL_DIR` 环境变量指定另一个技能目录。
数据来源：https://github.com/duruii/english-learning-skills 。

词条统计含短语、变形与其他记录，不是“20 万个考试单词”。
词典是扁平文本，自动提取的义项与搭配可能保留标签或存在分段局限；完整原文随时可查。
辨析只显示源词典已有材料及 `data/study-notes.json` 中的补充笔记，不捏造缺失资料。
补充笔记为 AI 辅助整理，例句为原创，不标称官方考点或统计考频。
大英赛题库用于词汇巩固，不标作考研或四六级真题。答案来自题库，未逐题重新审定。
本应用不调用在线模型，不能自动为每个词即时生成新的讲解。
收藏在当前浏览器本地，换浏览器后不会自动同步，建议定期导出。

## 验证

`python -X utf8 -m unittest discover -s tests -v`

## 文件

- `app.py`：本地 HTTP 服务；`lexicon.py`：检索、索引和词典解析。
- `static/`：前端页面、样式和交互。
- `data/study-notes.json`：可编辑的学习笔记。
- `data/dictionary.sqlite3`：可重新生成的搜索索引。
- `DESIGN.md`：界面设计依据。

设计参考：https://github.com/anthropics/skills/tree/main/skills/frontend-design 。
