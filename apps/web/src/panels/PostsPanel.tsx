import { useEffect, useState } from 'react'
import type { Post, User } from '@app/shared'
import { postsApi, usersApi } from '../api'
import { useError } from '../useError'

export function PostsPanel() {
  const [posts, setPosts] = useState<Post[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [authorId, setAuthorId] = useState<string>('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const { error, wrap } = useError()

  const refresh = () => wrap(async () => {
    const [p, u] = await Promise.all([postsApi.list(), usersApi.list()])
    setPosts(p); setUsers(u)
  })
  useEffect(() => { refresh() }, [])

  const userName = (id: number) => users.find((u) => u.id === id)?.name ?? `user#${id}`

  const create = (e: React.FormEvent) => {
    e.preventDefault()
    const aid = Number(authorId)
    if (!title.trim() || !content.trim() || !aid) return
    wrap(async () => {
      await postsApi.create({ title: title.trim(), content: content.trim(), authorId: aid })
      setTitle(''); setContent(''); setAuthorId('')
      await refresh()
    })
  }

  const startEdit = (p: Post) => {
    setEditingId(p.id); setEditTitle(p.title); setEditContent(p.content)
  }

  const saveEdit = (id: number) => {
    wrap(async () => {
      await postsApi.update(id, { title: editTitle, content: editContent })
      setEditingId(null)
      await refresh()
    })
  }

  const remove = (id: number) => {
    if (!confirm('Delete this post? Comments on it will also be deleted.')) return
    wrap(async () => { await postsApi.remove(id); await refresh() })
  }

  return (
    <div className="section">
      <h2>Create post</h2>
      <form className="form" onSubmit={create}>
        <input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          list="users-list"
          placeholder="Author user id"
          value={authorId}
          onChange={(e) => setAuthorId(e.target.value)}
        />
        <datalist id="users-list">
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </datalist>
        <textarea
          style={{ gridColumn: '1 / -1' }}
          placeholder="Content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="actions">
          <button className="btn primary" type="submit">Add</button>
        </div>
      </form>

      {error && <div className="error">{error}</div>}

      <h2>Posts ({posts.length})</h2>
      {posts.length === 0 ? (
        <div className="empty">No posts yet</div>
      ) : (
        <div className="list">
          {posts.map((p) =>
            editingId === p.id ? (
              <div key={p.id} className="row">
                <div className="info" style={{ display: 'grid', gap: 6 }}>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} />
                </div>
                <div className="ops">
                  <button className="btn primary" onClick={() => saveEdit(p.id)}>Save</button>
                  <button className="btn" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div key={p.id} className="row">
                <div className="info">
                  <div className="title">#{p.id} · {p.title}</div>
                  <div className="meta">by {userName(p.author_id)} · {new Date(p.created_at).toLocaleString()}</div>
                  <div className="body">{p.content}</div>
                </div>
                <div className="ops">
                  <button className="btn" onClick={() => startEdit(p)}>Edit</button>
                  <button className="btn danger" onClick={() => remove(p.id)}>Delete</button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}
