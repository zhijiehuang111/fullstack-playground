import { useState } from 'react'
import { UsersPanel } from './panels/UsersPanel'
import { PostsPanel } from './panels/PostsPanel'
import { CommentsPanel } from './panels/CommentsPanel'
import './App.css'

type Tab = 'users' | 'posts' | 'comments'

function App() {
  const [tab, setTab] = useState<Tab>('users')

  return (
    <div className="app">
      <h1>Fullstack Playground</h1>
      <nav className="tabs">
        <button
          className={tab === 'users' ? 'active' : ''}
          onClick={() => setTab('users')}
        >
          Users
        </button>
        <button
          className={tab === 'posts' ? 'active' : ''}
          onClick={() => setTab('posts')}
        >
          Posts
        </button>
        <button
          className={tab === 'comments' ? 'active' : ''}
          onClick={() => setTab('comments')}
        >
          Comments
        </button>
      </nav>

      {tab === 'users' && <UsersPanel />}
      {tab === 'posts' && <PostsPanel />}
      {tab === 'comments' && <CommentsPanel />}
    </div>
  )
}

export default App
