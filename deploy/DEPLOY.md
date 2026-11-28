# LifeOS 独立域名（.com）云服务器部署指南

本仓库自带零第三方依赖的 Node.js 服务（`server/index.mjs`），可直接同时托管静态页面与 `/lifeos-web/api/*` 后端接口。

## 1. 服务器环境要求

- **Node.js 18+**（推荐 Node 20 LTS）
- **Nginx**（用于绑定 `.com` 域名与 HTTPS 证书）
- **可选（如需要服务端课表图片 OCR 识图）**：
  - Ubuntu / Debian：`sudo apt update && sudo apt install -y tesseract-ocr tesseract-ocr-chi-sim`
  - 若不安装 `tesseract`，用户仍可直接粘贴课表文本或用本地自带 Key 分析导入。

## 2. 上传代码与配置环境变量

```bash
# 1. 进入项目目录
cd /opt/lifeos-web

# 2. 复制环境变量模板并填写密钥
cp .env.example .env
vim .env
```

`.env` 中至少填写：
- `DEEPSEEK_API_KEY=你的密钥`（用于 AI 诊断重排、课表解析、学校入口查询）
- `SUPABASE_PUBLISHABLE_KEY=...`（可选，用于云端登录同步）

## 3. 启动后端服务（建议使用 systemd 或 pm2 守护）

```bash
# 直接测试运行
npm start

# 或使用 pm2 常驻后台
pm2 start server/index.mjs --name lifeos-web
pm2 save
```

服务默认监听 `http://127.0.0.1:3000`，同时支持直接访问 `https://你的域名.com/` 与 `/lifeos-web/` 路径。

## 4. 配置 Nginx 与 .com HTTPS

参考 `deploy/nginx.conf.example` 配置站点与 SSL 证书（如 Certbot / 宝塔面板），重载 Nginx：

```bash
sudo nginx -t && sudo systemctl reload nginx
```

> 安全提醒：若使用 Supabase 云登录，请在 Supabase 后台 **Authentication -> URL Configuration** 中把你的 `https://你的域名.com` 加入 Redirect URLs。
