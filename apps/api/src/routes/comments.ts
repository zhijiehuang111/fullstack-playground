import { Router } from "express";
import { pool } from "../db/pool.js";

export const commentsRouter = Router();

commentsRouter.get("/", async (_req, res) => {
  const result = await pool.query("SELECT * FROM comments ORDER BY id");
  res.json(result.rows);
});

commentsRouter.get("/:id", async (req, res) => {
  const result = await pool.query("SELECT * FROM comments WHERE id = $1", [
    req.params.id,
  ]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: "comment not found" });
    return;
  }
  res.json(result.rows[0]);
});

commentsRouter.post("/", async (req, res) => {
  const { content, postId, authorId } = req.body;
  const result = await pool.query(
    "INSERT INTO comments (content, post_id, author_id) VALUES ($1, $2, $3) RETURNING *",
    [content, postId, authorId],
  );
  res.status(201).json(result.rows[0]);
});

commentsRouter.patch("/:id", async (req, res) => {
  const { content } = req.body;
  const result = await pool.query(
    "UPDATE comments SET content = COALESCE($1, content) WHERE id = $2 RETURNING *",
    [content ?? null, req.params.id],
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: "comment not found" });
    return;
  }
  res.json(result.rows[0]);
});

commentsRouter.delete("/:id", async (req, res) => {
  const result = await pool.query("DELETE FROM comments WHERE id = $1", [
    req.params.id,
  ]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: "comment not found" });
    return;
  }
  res.status(204).send();
});
