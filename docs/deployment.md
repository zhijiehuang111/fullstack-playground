# 部署到 VPS

把這個 monorepo（`apps/api` + `apps/web`）部署到 VPS。

## 架構

```
            Cloudflare (DNS + TLS)
                   │
                   ▼
              VPS (Ubuntu)
        ┌──────────────────────┐
        │  Nginx                │
        │   ├─ /       → 靜態   │ ← web (Vite build)
        │   └─ /api/*  → :PORT  │ ← reverse proxy 到 api
        │                       │
        │  PM2                  │
        │   └─ api (node)       │
        │                       │
        │  Docker               │
        │   └─ postgres:16      │
        └──────────────────────┘
```

## 步驟總覽

- [x] 1. VPS 基本設定（見 `vps-setup.md`）
- [x] 2. 安裝 Node.js / pnpm / Docker / PM2 / Nginx / git
- [x] 3. 把 code 拉到 VPS、安裝依賴（HTTPS clone, public repo, pull-only）
- [ ] 4. 設定環境變數（`.env`）
- [ ] 5. 用 Docker 啟動 Postgres、跑 migration
- [ ] 6. Build api（tsc/輸出 dist）與 web（vite build → `dist/` 靜態檔）
- [ ] 7. 用 PM2 啟動 api
- [ ] 8. 設定 Nginx：靜態服務 web、reverse proxy `/api` 到 api
- [ ] 9. Cloudflare DNS 指向 VPS
- [ ] 10. 開啟 HTTPS（Cloudflare proxy + Origin cert，或 Let's Encrypt）
- [ ] 11. PM2 開機自啟
- [ ] 12. 收尾：log、備份、防火牆覆查

---

## 紀錄

> 每完成一步就把實際指令、輸出、遇到的問題寫在下面。

### 1. VPS 基本設定 ✅

- 已建立非 root user、關閉 root SSH 與密碼登入、`ufw` active 且只放行 OpenSSH、`fail2ban` running。
- 細節指令見 `vps-setup.md`。

### 2. 安裝工具 ✅

#### Node 版本管理：fnm + .nvmrc

專案根目錄有 `.nvmrc = 24`、`package.json` 有 `"engines": { "node": ">=24" }`。
用 fnm 在 user 層管理 Node 版本（不要用 apt / NodeSource，會卡在系統路徑且難切版本）。

```bash
# fnm 安裝完，~/.bashrc 預設只有：
#   eval "$(fnm env --shell bash)"
# 加上 --use-on-cd，cd 進有 .nvmrc 的目錄會自動切版本。
nano .bashrc
source ~/.bashrc

fnm install 24
fnm default 24
node -v   # v24.x
```

驗證：`cd` 進 repo 時 shell 會印 `Using Node v24.x.x`。

#### pnpm：用 corepack，不要 `npm i -g pnpm`

`package.json` 有 `"packageManager": "pnpm@10.33.2"`，corepack 會讀這欄位自動拿對應版本。

```bash
corepack enable        # 機器層一次性，shim 進 PATH
# 進到 repo 第一次跑 pnpm 時，corepack 自動下載 10.33.2 到 ~/.cache/node/corepack/
cd ~/playground
pnpm install
```

**關鍵概念**：pnpm binary 是 user 層 cache，但**版本由每個 repo 的 `packageManager` 欄位決定**。
切到別的用 pnpm 9 的 repo，corepack 會自動切版本。換機器、隊友 clone 都不會版本不一致。

⚠️ 不要 `sudo npm install -g pnpm`，會跟 corepack shim 打架。

### 3. 拉 code、安裝依賴 ✅

Public repo + 只在本機 push、VPS 只 pull → 直接 HTTPS clone，不設 SSH key

### 4. 設定環境變數（下一步）
