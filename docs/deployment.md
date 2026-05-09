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
- [x] 4. 設定環境變數（`.env`）
- [x] 5. 用 Docker 啟動 Postgres、跑 migration
- [x] 6. Build api（tsc/輸出 dist）與 web（vite build → `dist/` 靜態檔）
- [x] 7. 用 PM2 啟動 api
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

### 4. 設定環境變數 ✅

#### 權限：`chmod 600 .env`

`.env` 是明文密碼，改成只有 owner 能讀寫。

驗證：

```bash
ls -la .env
# -rw------- 1 <username> <username> ...
```

#### 把所有對外服務改成只 bind loopback

兩個改動：

1. **`apps/api/src/index.ts`** — `app.listen(port, '127.0.0.1', ...)`
   - 不寫 host 時 Node 預設綁 `0.0.0.0`（所有介面），公網都看得到。
   - 改成 `127.0.0.1` 後只接 loopback，Nginx 從本機 reverse proxy 進來。

2. **`docker-compose.yml`** — `"127.0.0.1:${POSTGRES_PORT}:5432"`
   - **重要**：Docker 直接動 iptables，把規則插在 ufw 前面，
     ufw `deny 5432` 對 container **無效**，會把 Postgres 直接曝光到公網。
   - bind 到 `127.0.0.1` 是最簡單、不需要改 `DOCKER-USER` chain 的解法。

### 5. Docker 啟動 Postgres + 跑 migration ✅

#### 啟動 Postgres

```bash
cd ~/playground
docker compose up -d   # -d = detached（背景跑）
docker compose ps      # 確認 running
```

#### 跑 migration

repo 沒有 migration runner（`apps/api/migrations/0001_init.sql` 是 raw SQL，
`package.json` 也沒對應 script）。手動灌進 Postgres：

```bash
# 把 .env 載到 host shell（這樣 $POSTGRES_USER 等變數可用）
set -a; source .env; set +a

# 餵 SQL 進 container 的 psql
docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  < apps/api/migrations/0001_init.sql
```

關鍵語法：

- **`-T`**：不分配 TTY。預設 `docker compose exec` 會給 TTY，TTY 會把 stdin 接管，
  導致 shell `<` 重導送不進去。手動互動進 psql 時不要加；餵檔案/pipe/script 一定要加。
- **`-U "$POSTGRES_USER" -d "$POSTGRES_DB"`**：明確指定 user 和 db。不寫的話 psql
  會 fallback 到 OS 登入帳號（container 裡是 `root`），找不到對應 PG user 直接報錯。
  變數展開是在 **host shell** 做的，所以前面要先 `source .env`。

#### 驗證 schema

```bash
docker compose exec postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt"
```

應該看到三個 table：`users` / `posts` / `comments`。

psql meta-command 速查：`\dt` 列 table、`\d users` 看 schema、`\l` 列 db、`\q` 退出。

#### 注意：volume 持久化

資料存在 named volume `pgdata` 裡，`docker compose down` 之後重新 `up` 不會重跑
migration（schema 還在）。除非用 `docker compose down -v`（`-v` 砍 volume）。

### 6. Build api 與 web ✅

```bash
cd ~/playground
pnpm build      # root 的 "build": "pnpm -r build"，遞迴跑每個 workspace 的 build
```

兩個 workspace 的 build 角色不同：

#### `apps/api`：`tsc -p tsconfig.json`

純 TypeScript compiler，**翻譯**：`src/*.ts` → `dist/*.js`，一對一輸出。
不 bundle、不 minify、不改 import 路徑——`import express from 'express'` 在輸出裡原樣保留，
runtime 由 Node 自己去 `node_modules` 解析。**部署時 `node_modules` 必須在 VPS 上**。

#### `apps/web`：`tsc -b && vite build`

兩步，順序有意義：

- **`tsc -b`**：build mode，按 `tsconfig.json` 的 `references`（`tsconfig.app.json` + `tsconfig.node.json`）
  順序跑型別檢查。兩份 sub-config 是因為 `src/**` 跑在瀏覽器（要 `DOM` lib + `vite/client` types），
  `vite.config.ts` 跑在 Node（要 `node` types），型別環境必須隔離。兩份都設 `noEmit: true`，
  所以這步**只 type check 不產出 .js**——擋型別錯，錯了就終止。
- **`vite build`**：真正的 bundler（esbuild + Rollup）。把 `.ts/.tsx/.css/依賴` 全部攤平成
  少量 hash 過的 chunks，**包含 `node_modules` 都 bundle 進去**。輸出 `dist/index.html` + `dist/assets/*`，
  純靜態檔，runtime 不需要 `node_modules`。

對照表：

|                       | `apps/api`                  | `apps/web`                                |
| --------------------- | --------------------------- | ----------------------------------------- |
| 跑在哪                | Node.js（VPS）              | 瀏覽器                                    |
| 編譯器                | tsc（emit）                 | esbuild/Rollup（vite）；tsc 只 type-check |
| 是否 bundle           | ❌ 多檔對多檔               | ✅ 攤平成少量 chunks                      |
| 部署需 `node_modules` | ✅ 要                       | ❌ 不用                                   |
| 部署方式              | PM2 跑 `node dist/index.js` | nginx serve `dist/`                       |

#### 驗證

```bash
ls apps/api/dist/index.js          # 存在
ls apps/web/dist/index.html        # 存在，旁邊應該有 assets/
```

### 7. PM2 啟動 api ✅

#### 用 ecosystem config 而不是 CLI 一行

`pm2 start dist/index.js --name api --node-args=...` 也能跑，但設定散在指令歷史、難 review。
建檔 `ecosystem.config.cjs` 放 repo 根，commit 進 repo，是 single source of truth。

```js
// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "api",
      cwd: __dirname, // = repo 根，給 --env-file 找 .env 用
      script: "./apps/api/dist/index.js",
      node_args: "--env-file=.env", // Node 24 內建，不靠 dotenv
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "300M",
    },
  ],
};
```

關鍵選擇說明：

- **`.cjs` 不用 `.js`**：root `package.json` 沒設 `"type"`（現在是 CJS 預設），
  但未來如果加上 `"type": "module"`，`.js` 會突然變 ESM 把 PM2 弄壞。`.cjs` 副檔名
  強制鎖成 CJS，免疫這個雷。PM2 載 config 是同步 `require()`，CJS 是文件主推格式。
- **`cwd: __dirname`**：把 process cwd 鎖成 config 檔所在目錄（repo 根），
  這樣 `--env-file=.env` 就能解析到 `~/playground/.env`。
- **`exec_mode: "fork"` + `instances: 1`**：單一 Node process。pg pool 不適合
  cluster 模式（會每個 worker 自己一個 pool，連線數翻倍），等真的有負載再考慮。

#### 順手修 `apps/api/package.json` 的 start

dev 有 `--env-file=../../.env`，start 沒有 → `pnpm --filter @app/api start` 會炸
`DATABASE_URL is not set`。改成跟 dev 對齊：

```json
"start": "node --env-file=../../.env dist/index.js"
```

PM2 不走這個 script（直接 `node` exec `script` 路徑），所以 prod 不受影響；
但本機想驗證 prod build 時 `pnpm start` 就能用。

#### VPS 啟動

```bash
pm2 start ecosystem.config.cjs
```

#### 驗證

```bash
pm2 ls                                     # status = online
pm2 logs api --lines 30 --nostream         # 應看到 "api listening on http://localhost:3000"
curl http://127.0.0.1:3000/users   # 回 [] 或現有 user list
```

#### 踩過的雷：`pm2 ls` 的 ↺ 累積到 1184

第一次啟動之後 `pm2 ls` 看到 `↺ = 1184`（restart 次數）。這數字很嚇人但要先分辨：

```bash
pm2 ls && sleep 30 && pm2 ls
# ↺ 沒變 → 歷史傷疤，現在穩了
# ↺ 還在漲 → 仍在 crash loop，要查 pm2 logs api --err
```

這次是「沒在漲」，代表早期某段時間（可能是 .env 路徑沒對好、或 cwd 不對 → pool.ts
throw `DATABASE_URL is not set` → process exit → PM2 restart → 再 throw）累積出來的，
之後修好就不再增加。確認穩了之後：

```bash
pm2 reset api      # counter 歸零，從現在開始重新計數
```

之後監控就乾淨了——再漲就是真的有新問題。

注意 PM2 預設 `min_uptime: 1000ms`：process 活超過 1 秒就不算 fast crash，
restart counter **沒上限**會無限累積。如果想加保險可以在 ecosystem 加：

```js
min_uptime: "10s",
max_restarts: 5,
restart_delay: 2000,
```

連續失敗 5 次就標 errored、停止 restart，避免 log 被灌爆。目前先不加，留作備案。

#### 現在的可用度狀態

| 事件           | 行為                                          |
| -------------- | --------------------------------------------- |
| ssh 登出       | api 繼續跑 ✅（PM2 是 daemon，跟 shell 脫鉤） |
| api crash      | PM2 自動重啟 ✅                               |
| **VPS reboot** | **api 不會自己回來 ❌**                       |

VPS reboot 後自動回來要做第 11 步（`pm2 startup` + `pm2 save`），現在先放著。
