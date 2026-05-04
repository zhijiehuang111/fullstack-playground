import { useEffect, useState } from 'react'
import type { Comment, Post, User } from '@app/shared'
import { commentsApi, postsApi, usersApi } from '../api'
import { useError } from '../useError'

export function CommentsPanel() {
  const [comments, setComments] = useState<Comment[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [content, setContent] = useState('')
  const [postId, setPostId] = useState('')
  const [authorId, setAuthorId] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const { error, wrap } = useError()

  const refresh = () => wrap(async () => {
    const [c, u, p] = await Promise.all([commentsApi.list(), usersApi.list(), postsApi.list()])
    setComments(c); setUsers(u); setPosts(p)
  })
  useEffect(() => { refresh() }, [])

  const userName = (id: number) => users.find((u) => u.id === id)?.name ?? `user#${id}`
  const postTitle = (id: number) => posts.find((p) => p.id === id)?.title ?? `post#${id}`

  const create = (e: React.FormEvent) => {
    e.preventDefault()
    const pid = Number(postId)
    const aid = Number(authorId)
    if (!content.trim() || !pid || !aid) return
    wrap(async () => {
      await commentsApi.create({ content: content.trim(), postId: pid, authorId: aid })
      setContent(''); setPostId(''); setAuthorId('')
      await refresh()
    })
  }

  const startEdit = (c: Comment) => {
    setEditingId(c.id); setEditContent(c.content)
  }

  const saveEdit = (id: number) => {
    wrap(async () => {
      await commentsApi.update(id, { content: editContent })
      setEditingId(null)
      await refresh()
    })
  }

  const remove = (id: number) => {
    if (!confirm('Delete this comment?')) return
    wrap(async () => { await commentsApi.remove(id); await refresh() })
  }

  return (
    <div className="section">
      <h2>Create comment</h2>
      <form className="form" onSubmit={create}>
        <input
          list="posts-list"
          placeholder="Post id"
          value={postId}
          onChange={(e) => setPostId(e.target.value)}
        />
        <datalist id="posts-list">
          {posts.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </datalist>
        <input
          list="users-list-c"
          placeholder="Author user id"
          value={authorId}
          onChange={(e) => setAuthorId(e.target.value)}
        />
        <datalist id="users-list-c">
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

      <h2>Comments ({comments.length})</h2>
      {comments.length === 0 ? (
        <div className="empty">No comments yet</div>
      ) : (
        <div className="list">
          {comments.map((c) =>
            editingId === c.id ? (
              <div key={c.id} className="row">
                <div className="info">
                  <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} />
                </div>
                <div className="ops">
                  <button className="btn primary" onClick={() => saveEdit(c.id)}>Save</button>
                  <button className="btn" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div key={c.id} className="row">
                <div className="info">
                  <div className="title">#{c.id} · on “{postTitle(c.post_id)}”</div>
                  <div className="meta">by {userName(c.author_id)} · {new Date(c.created_at).toLocaleString()}</div>
                  <div className="body">{c.content}</div>
                </div>
                <div className="ops">
                  <button className="btn" onClick={() => startEdit(c)}>Edit</button>
                  <button className="btn danger" onClick={() => remove(c.id)}>Delete</button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}
