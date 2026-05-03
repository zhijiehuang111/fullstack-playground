import { Router } from "express";
import { pool } from "../db/pool.js";

export const postsRouter = Router();

postsRouter.get("/", async (_req, res) => {
  const result = await pool.query("SELECT * FROM posts ORDER BY id");
  res.json(result.rows);
});

postsRouter.get("/:id", async (req, res) => {
  const result = await pool.query("SELECT * FROM posts WHERE id = $1", [
    req.params.id,
  ]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: "post not found" });
    return;
  }
  res.json(result.rows[0]);
});

postsRouter.post("/", async (req, res) => {
  const { title, content, authorId } = req.body;
  const result = await pool.query(
    "INSERT INTO posts (title, content, author_id) VALUES ($1, $2, $3) RETURNING *",
    [title, content, authorId],
  );
  res.status(201).json(result.rows[0]);
});

postsRouter.patch("/:id", async (req, res) => {
  const { title, content } = req.body;
  const result = await pool.query(
    "UPDATE posts SET title = COALESCE($1, title), content = COALESCE($2, content) WHERE id = $3 RETURNING *",
    [title ?? null, content ?? null, req.params.id],
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: "post not found" });
    return;
  }
  res.json(result.rows[0]);
});

postsRouter.delete("/:id", async (req, res) => {
  const result = await pool.query("DELETE FROM posts WHERE id = $1", [
    req.params.id,
  ]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: "post not found" });
    return;
  }
  res.status(204).send();
});
