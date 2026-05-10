import { useState } from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import { UsersPanel } from "./panels/UsersPanel";
import { PostsPanel } from "./panels/PostsPanel";
import { CommentsPanel } from "./panels/CommentsPanel";
import { About } from "./pages/About";
import { Ping } from "./pages/Ping";
import "./App.css";

type Tab = "users" | "posts" | "comments";

function Home() {
  const [tab, setTab] = useState<Tab>("users");

  return (
    <>
      <nav className="tabs">
        <button
          className={tab === "users" ? "active" : ""}
          onClick={() => setTab("users")}
        >
          Users
        </button>
        <button
          className={tab === "posts" ? "active" : ""}
          onClick={() => setTab("posts")}
        >
          Posts
        </button>
        <button
          className={tab === "comments" ? "active" : ""}
          onClick={() => setTab("comments")}
        >
          Comments
        </button>
      </nav>

      {tab === "users" && <UsersPanel />}
      {tab === "posts" && <PostsPanel />}
      {tab === "comments" && <CommentsPanel />}
    </>
  );
}

function App() {
  return (
    <div className="app">
      <h1>Playground</h1>
      <nav className="route-nav">
        <NavLink to="/" end>
          Home
        </NavLink>
        <NavLink to="/about">About</NavLink>
        <NavLink to="/ping">Ping</NavLink>
      </nav>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/ping" element={<Ping />} />
        <Route path="*" element={<p>404 — not found</p>} />
      </Routes>
    </div>
  );
}

export default App;
