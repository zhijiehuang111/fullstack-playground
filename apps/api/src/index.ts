import express from "express";
import { pool } from "./db/pool.js";

const app = express();
app.use(express.json());

app.get("/users", async (_req, res) => {
  const result = await pool.query("SELECT * FROM users ORDER BY id");
  res.json(result.rows);
});

app.get("/users/:id", async (req, res) => {
  const result = await pool.query("SELECT * FROM users WHERE id = $1", [
    req.params.id,
  ]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  res.json(result.rows[0]);
});

app.post("/users", async (req, res) => {
  const { name, email } = req.body;
  const result = await pool.query(
    "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *",
    [name, email],
  );
  res.status(201).json(result.rows[0]);
});

app.patch("/users/:id", async (req, res) => {
  const { name, email } = req.body;
  const result = await pool.query(
    "UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email) WHERE id = $3 RETURNING *",
    [name ?? null, email ?? null, req.params.id],
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  res.json(result.rows[0]);
});

app.delete("/users/:id", async (req, res) => {
  const result = await pool.query("DELETE FROM users WHERE id = $1", [
    req.params.id,
  ]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  res.status(204).send();
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`api listening on http://localhost:${port}`);
});
