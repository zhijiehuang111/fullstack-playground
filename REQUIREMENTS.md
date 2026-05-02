# Fullstack Playground 需求

## 目標

做一個基本的 full-stack 專案，先在本地跑通 User / Post / Comment 的 CRUD。
重點放在後端，部署留到之後再說。

## 技術選型

### 後端（重點）

- Node.js + Express
- TypeScript
- PostgreSQL（用 Docker 跑）

### 前端

- React
- TypeScript

### 開發環境

- pnpm workspace（monorepo，前後端共用）
- Docker 跑 Postgres
- 部署相關（CI/CD、雲端、Nginx 等）**先不做**

## 功能範圍

只做基本的 CRUD，三個資料模型：

### User

- Create / Read / Update / Delete
- 欄位：id, name, email, createdAt

### Post

- Create / Read / Update / Delete
- 屬於某個 User（author）
- 欄位：id, title, content, authorId, createdAt

### Comment

- Create / Read / Update / Delete
- 屬於某個 Post，由某個 User 留言
- 欄位：id, content, postId, authorId, createdAt

## 不做的事（明確排除）

- 認證 / 登入 / JWT（先省略，user 直接用 id 帶）
- 權限控制
- 部署、CI/CD、雲端
- 複雜的前端 UI / 設計
