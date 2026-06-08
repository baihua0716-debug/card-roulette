# 卡牌轮盘

一个可直接部署到 GitHub Pages 的公开网页游戏。玩法来自原 Streamlit 版本：黑卡 / 白卡概率博弈、技能系统、电脑 AI。

## 在线部署

1. 把本目录提交并推送到 GitHub 仓库。
2. 打开仓库的 `Settings`。
3. 进入 `Pages`。
4. 在 `Build and deployment` 中选择 `Deploy from a branch`。
5. Branch 选择 `main` 或你的默认分支，目录选择 `/root`。
6. 保存后等待 GitHub Pages 生成站点。

入口文件是 `index.html`，不需要安装 Python、Streamlit、Node 或任何构建工具。

## 本地预览

在当前目录运行任意静态服务器即可，例如：

```powershell
python -m http.server 8000
```

然后访问：

```text
http://127.0.0.1:8000/
```

## 文件说明

- `index.html`：网页入口。
- `styles.css`：响应式游戏界面样式。
- `game-core.js`：游戏规则、技能效果、状态机和电脑 AI。
- `app.js`：DOM 渲染和玩家交互绑定。
- `tests/state-machine-regression.mjs`：核心状态机回归测试。
- `streamlit_devil_card_game.py`：原 Streamlit 版本，保留作参考。

## 回归测试

```powershell
node tests/state-machine-regression.mjs
```
