import express from "express";
import { usersRouter } from "./routes/users.js";
import { postsRouter } from "./routes/posts.js";
import { commentsRouter } from "./routes/comments.js";
import { errorHandler } from "./middleware/errorHandler.js";

export const app = express();

app.use(express.json());

app.use("/users", usersRouter);
app.use("/posts", postsRouter);
app.use("/comments", commentsRouter);

app.use(errorHandler);
