# 部署到 VPS

把這個 monorepo（`apps/api` + `apps/web`）部署到 VPS。

## 架構

```
            Cloudflare (DNS + TLS)
                   │
                   ▼
              VPS (Ubuntu)
        ┌─────────────────────────┐
        │  Nginx                  │
        │   ├─ /       → 靜態     │ ← web (Vite build)
        │   └─ /api/*  → :PORT    │ ← reverse proxy 到 api
        │                         │
        │  PM2                    │
        │   └─ api (node)         │
        │                         │
        │  Docker                 │
        │   └─ postgres:16        │
        └─────────────────────────┘
```

## 步驟總覽

- [x] 1. VPS 基本設定（見 `vps-setup.md`）
- [x] 2. 安裝 Node.js / pnpm / Docker / PM2 / Nginx / git
- [x] 3. 把 code 拉到 VPS、安裝依賴（HTTPS clone, public repo, pull-only）
- [x] 4. 設定環境變數（`.env`）
- [x] 5. 用 Docker 啟動 Postgres、跑 migration
- [x] 6. Build api（tsc/輸出 dist）與 web（vite build → `dist/` 靜態檔）
- [x] 7. 用 PM2 啟動 api
- [x] 8. 設定 Nginx：靜態服務 web、reverse proxy `/api` 到 api
- [x] 9. Cloudflare DNS 指向 VPS（灰雲 / DNS only）
- [x] 10. 開啟 HTTPS（Let's Encrypt）
- [x] 11. PM2 開機自啟 + Docker container 自啟

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

### 8. 設定 Nginx ✅

#### 架構

```
瀏覽器 → Nginx (80) ─┬─ /        → 靜態檔 (apps/web/dist/)
                     └─ /api/*   → reverse proxy → 127.0.0.1:3000 (PM2 api)
```

#### `sites-available` / `sites-enabled` 慣例

Debian/Ubuntu 把 Nginx config 拆成兩層資料夾：

- `/etc/nginx/sites-available/` — **所有寫過的 config**（草稿夾）
- `/etc/nginx/sites-enabled/` — **目前啟用中**（`/etc/nginx/nginx.conf` 裡 `include sites-enabled/*;`，Nginx 只讀這個）

啟用 = 建 symlink（`ln -s` 把 sites-available 的檔案捷徑放進 sites-enabled）。停用 = `rm` 那個 symlink，原檔還在 sites-available 留著想恢復就再 `ln -s`。

為啥不直接寫在 sites-enabled、或複製兩份：

- 編輯只在一個地方（sites-available），不會兩份漂移
- 啟用/停用就是 symlink 增減，原檔不動
- `git`-able：可以把 sites-available 的 config 抄一份進 repo 版控

⚠️ 有些發行版（CentOS、Alpine）沒這兩層，只有 `/etc/nginx/conf.d/*.conf`。Debian/Ubuntu 是約定俗成多了一層 staging。

#### 砍 default site

```bash
sudo rm /etc/nginx/sites-enabled/default
sudo systemctl reload nginx     # 砍完一定要 reload，不然進程裡的 config 還是舊的
```

#### 寫 site config

`/etc/nginx/sites-available/playground`：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name <vps-ip>;

    root /home/<username>/playground/apps/web/dist;
    index index.html;

    # SPA fallback：找不到實體檔回 index.html，讓 React Router 接管 client routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API reverse proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Vite 產出的 asset 檔名有 hash，可以放心長 cache
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

`server_name <vps-ip>` 是現在用 IP 直接打的 placeholder；之後上 domain 改成 `server_name your-domain.com;`。（題外話：因為 sites-enabled 砍掉 default 後只剩這一個 server block，自動變 default，所以 `server_name` 寫什麼瀏覽器都進得來——`server_name _;` + `listen 80 default_server;` 是更「沒 domain」的標準寫法，但意思一樣。）

#### `location` 匹配 + `proxy_pass` 結尾斜線（重要觀念）

**`location /api/`** 是 URL path 的**前綴匹配**——請求 path 以 `/api/` 開頭才進這個 block（跟 Express `app.use("/api", ...)` 同概念）。一個 server 裡多個 `location`，Nginx 挑最具體的跑：`/api/users` 進來時 `location /` 跟 `location /api/` 都能匹配，但後者更具體 → 走後者。

**`proxy_pass`** 是「不要自己處理，當中間人轉給後面這台」。結尾有沒有 `/` 是兩條完全不同的規則：

| `proxy_pass` 結尾 | 行為                                               | 何時用                   |
| ----------------- | -------------------------------------------------- | ------------------------ |
| 有 `/`            | **剝掉 `location` 前綴，剩下接在 proxy_pass 後面** | 後端**沒**帶 `/api` 前綴 |
| 沒 `/`            | **整段 URI 原樣轉發**                              | 後端**有**帶 `/api` 前綴 |

本 repo 前端 `fetch('/api/users')`、後端 `app.use("/users", ...)`（`apps/api/src/app.ts:11`）**沒**帶前綴，所以用「有 `/`」：

| 瀏覽器               | 剝完 `/api/` 剩下 | 接到 `http://127.0.0.1:3000/` 後      | api 收到            |
| -------------------- | ----------------- | ------------------------------------- | ------------------- |
| `/api/users`         | `users`           | `http://127.0.0.1:3000/users`         | `/users` ✅         |
| `/api/posts/1`       | `posts/1`         | `http://127.0.0.1:3000/posts/1`       | `/posts/1` ✅       |
| `/api/users?limit=5` | `users?limit=5`   | `http://127.0.0.1:3000/users?limit=5` | `/users?limit=5` ✅ |

「結尾 `/` 一定要保留」的真正原因是字串接：少了 `/` 會接成 `http://127.0.0.1:3000users`，整個 URL 壞掉。

反面教材（記反就 404）：

```nginx
# ❌ 後端是 /users，但用了「原樣送」
location /api/ { proxy_pass http://127.0.0.1:3000; }   # → api 收到 /api/users → 404

# ❌ 後端是 /api/users，但用了「剝前綴」
location /api/ { proxy_pass http://127.0.0.1:3000/; }  # → api 收到 /users → 404
```

選哪條 = 看後端路由有沒有帶 `/api`，兩邊要對得上。

`/api` 前綴是給 Nginx 看的「路標」（讓它能 prefix 區分「這要轉給 api」vs「這是要靜態檔」），不是 api 自己的路徑。前端寫 `fetch('/api/...')` 是相對 URL，自動接到當前 origin → 跟 web 同 origin → 沒 CORS 問題。

#### 啟用 + 測試 + reload（每次改 config 的標準三步）

```bash
sudo ln -s /etc/nginx/sites-available/playground /etc/nginx/sites-enabled/
sudo nginx -t                  # 只測 syntax 不套用，先測過再 reload，避免改壞整站掛
sudo systemctl reload nginx    # graceful：起新 worker 套新 config，舊的處理完手上請求才退，不中斷連線
```

#### 給 nginx 讀靜態檔的權限

Nginx worker 跑在 `www-data`（master 是 root，但 worker 降權；`ps aux | grep nginx` 看得到），不是你的 user。`/home/<username>` 預設 `750`，others 完全進不去 → worker 連 stat 都 fail。

```bash
chmod o+x /home/<username>     # 只開 execute（能 traverse 進來），不開 read（不能 ls home 內容）
```

dist 裡的檔案因為 `umask 002` 預設就是 `775/664`（others 已有 r/x），不用再動。驗證：

```bash
sudo -u www-data cat /home/<username>/playground/apps/web/dist/index.html
```

讀得到就 OK。

#### 驗證

從本機（不是 VPS）：

```bash
curl -I http://<vps-ip>/              # 200, content-type text/html
curl http://<vps-ip>/api/users        # api 的 JSON response
```

瀏覽器打 `http://<vps-ip>/` 應該看到 web app；切到任意 SPA route 重整也要回得來（驗 SPA fallback）。

#### 踩過的雷

**砍 default 後還看得到 Welcome page** — `rm` symlink 只動檔案，nginx 進程裡的 config 還是舊的。`sudo systemctl reload nginx`。瀏覽器快取也可能誤導，用無痕或 `curl -I` 確認。

**第一次 curl 拿到 500 不是 403** — 兩個都跟權限有關但卡點不同：

> 一句話：500 是 Nginx 連 stat 都 fail（home 目錄沒 `o+x`，traverse 不進去 → 內部處理鏈炸掉），403 是進得去但檔案沒 `r`。補完 `chmod o+x /home/<username>` 就消失。

排查永遠先看 `sudo tail /var/log/nginx/error.log`，會直接寫卡在哪個路徑。

### 9. Cloudflare DNS ✅

Domain 在 Cloudflare 買的，nameserver 預設就指向 Cloudflare，只要在 DNS 頁加一筆 A record：

- Type: `A`
- Name: `@`（root domain）
- IPv4: `<vps-ip>`
- Proxy status: **DNS only（灰雲）**

選灰雲的理由：第 10 步要用 Let's Encrypt 練 certbot 流程，灰雲下瀏覽器直連 VPS，cert 在 VPS 上發、在 VPS 上驗證（http-01 challenge 走 80 port），整個鏈路最直觀。橘雲 + Cloudflare Origin Cert 比較簡單但比較「黑盒」，等之後想加 CDN/DDoS 保護再切。

代價：VPS 真實 IP 會直接從 `dig your-domain.com` 查得到（A record 就是寫這個 IP）。但 ufw + fail2ban + 關 root SSH 已經做了，個人專案可接受。

### 10. HTTPS / Let's Encrypt ✅

#### 概念

HTTPS = HTTP 包在 TLS（舊名 SSL）裡傳；cert 是 CA 簽發的「身分證」，證明這把 public key 屬於這個 domain；現代 TLS 1.3 用 ECDHE 算 session key（forward secrecy），cert 只負責簽名驗身分、不直接搬 session key。

#### 安裝 certbot（snap）

EFF 官方主推 snap 版（永遠最新、自帶 Python 不會被系統升級爆掉）；apt 版也能跑但較舊。

```bash
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot   # 讓 sudo 找得到
sudo certbot --version
```

`--classic` = 關 sandbox，因為 certbot 要寫 `/etc/letsencrypt/`、改 `/etc/nginx/`。

#### 前置檢查

跑 certbot 前要確認：Nginx config `server_name` 從 `<vps-ip>` 改成 domain（Let's Encrypt 不發 cert 給 IP）、ufw 開 80（http-01 challenge 走 80）、`dig your-domain.com +short` 解析正確、`curl -I http://your-domain.com/` 拿到 200。

#### 跑 certbot（互動式）

```bash
sudo certbot --nginx
```

certbot 會掃所有 `server_name`、列清單問選哪個、自動跑 http-01 challenge、cert 存到 `/etc/letsencrypt/live/<domain>/`、改 Nginx config 加 `listen 443 ssl` + `ssl_certificate` + 80→443 redirect、`nginx -t` + reload。第一次跑會問 email（cert 過期通知）、同意 ToS、EFF newsletter（選 N）。

#### 驗證

```bash
curl -I https://your-domain.com/    # 200
curl -I http://your-domain.com/     # 301 → https
sudo certbot renew --dry-run        # 模擬續期
```

#### 自動 renew

Let's Encrypt cert 只活 90 天；snap 版 certbot 自動裝 systemd timer 每天跑兩次 `certbot renew`，到期前 30 天自動續、續完自動 reload Nginx，**裝完不用管**。

### 11. 開機自啟（PM2 + Docker） ✅

目標：VPS reboot 後不用 ssh 上來手動啟動，整個 stack 自己回來。三段：postgres container、PM2 daemon、api process。

#### Docker container：`restart: unless-stopped`

`docker compose up -d` 只是「現在跑起來」，container 預設沒 restart policy → reboot 後 Docker daemon 雖然會自啟，但 container 不會跟著起。

編 `docker-compose.yml`，給 postgres service 加：

```yaml
services:
  postgres:
    # ...
    restart: unless-stopped
```

#### PM2 daemon：systemd service

PM2 是 user-space daemon，自己**不會**在開機被叫起來，要靠 systemd 拉。`pm2 startup` 不直接安裝，而是**印一段 `sudo env ...` 指令**叫你貼——因為要寫 `/etc/systemd/system/` 需要 root，PM2 不自己 sudo。

```bash
pm2 startup
# 印出：sudo env PATH=$PATH:... pm2 startup systemd -u <username> --hp /home/<username>
# 把那段整段複製貼上跑一次 → 寫 unit + enable
```

#### `pm2 save`：把 process list 存進 dump

systemd 會拉 daemon，但 daemon 起來時是空的——它不知道你有哪些 app。`pm2 save` 把當前 `pm2 ls` dump 成 `~/.pm2/dump.pm2`，daemon 開機讀這檔還原。

```bash
pm2 save
```

⚠️ 之後**每次改 process list（add/delete app）都要重 save 一次**，否則下次 reboot 會還原成舊狀態。

#### 大雷：fnm + PM2 = `spawn node ENOENT`

第一次 reboot 後撞到的：`pm2 ls` 顯示 `online` 但 `memory: 0b`、`ss -tlnp | grep 3000` 沒輸出、`pm2 logs api --err` 空的、手動 `pm2 restart api` 也救不回來。

死因藏在 `~/.pm2/pm2.log`：

```
PM2 error: Error: spawn node ENOENT
    at ChildProcess._handle.onexit (node:internal/child_process:287:19)
```

（`pm2 ls` 的 `pidusage` error 是症狀不是病因——daemon 拿著不存在的 PID 去查 stats 才噴的。）

##### 為什麼 fnm 會雷

fnm 用 **per-shell multishell**：每個 shell 開一個臨時目錄（`/tmp/fnm_multishells/<shell-pid>_<timestamp>/bin/node`），把這個路徑塞進 PATH。PM2 daemon 在你跑 `pm2 start` 時抄走當下 shell 的 PATH，之後就 detached 自己跑。

reboot 之後兩件事一起發生：

1. **`/tmp` 被 systemd-tmpfiles 清空**：所有 multishell 目錄物理消失
2. **systemd 啟動 daemon 時不跑 `~/.bashrc`**：連 fnm hook 都沒 load

systemd unit 裡寫的 PATH 指向已經不存在的目錄 → daemon resurrect 後第一次 spawn `node` → ENOENT → api 永遠起不來。即使你 ssh 進來手動 `pm2 restart api`，那個 IPC 是丟給 daemon 的，daemon 還是用自己內部那條壞掉的 PATH 去 spawn，一樣救不回來。

##### 修法：`ecosystem.config.cjs` 寫死 `interpreter`

把 PM2 spawn child 用的 node 從「靠 PATH 找」改成「絕對路徑」，跟 version manager 完全脫鉤：

```js
// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "api",
      cwd: __dirname,
      script: "./apps/api/dist/index.js",
      interpreter: process.execPath, // ← 關鍵：用當前 PM2 的 node 絕對路徑
      node_args: "--env-file=.env",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "300M",
    },
  ],
};
```

`process.execPath` 是執行當前這個 node process 的 binary 絕對路徑（PM2 載 config 時自己就是 node process）。VPS 上會自動填成類似 `/home/<username>/.local/share/fnm/node-versions/v24.x.x/installation/bin/node`。

也可以寫死字串路徑，但 `process.execPath` 跨機 portable、Node 升版自動跟著走，commit 進 repo 後沒副作用（Mac dev 不跑 PM2）。

##### 套用 + 全清重來

舊 daemon 抄了壞 PATH 進去，state 已被污染，光 `pm2 restart` 沒用。要連 daemon 帶 dump 一起砍：

```bash
pm2 kill                              # 殺整個 PM2 daemon
rm -f ~/.pm2/dump.pm2 ~/.pm2/pm2.log  # 清舊 dump 跟 log
cd ~/playground
pm2 start ecosystem.config.cjs
pm2 ls                                # memory 應該有數字（不是 0b）
ss -tlnp | grep 3000                  # LISTEN 127.0.0.1:3000
pm2 save                              # 把乾淨狀態寫進 dump
```

#### 真實演練：reboot 驗收

```bash
sudo reboot
# 等 30 秒 ssh 回來
docker compose ps              # postgres Up（自啟）
pm2 ls                         # api online，memory 有數字
ss -tlnp | grep 3000           # LISTEN
```
