import { useEffect, useState } from 'react'
import type { User } from '@app/shared'
import { usersApi } from '../api'
import { useError } from '../useError'

export function UsersPanel() {
  const [users, setUsers] = useState<User[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const { error, wrap } = useError()

  const refresh = () => wrap(async () => setUsers(await usersApi.list()))
  useEffect(() => { refresh() }, [])

  const create = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return
    wrap(async () => {
      await usersApi.create({ name: name.trim(), email: email.trim() })
      setName(''); setEmail('')
      await refresh()
    })
  }

  const startEdit = (u: User) => {
    setEditingId(u.id); setEditName(u.name); setEditEmail(u.email)
  }

  const saveEdit = (id: number) => {
    wrap(async () => {
      await usersApi.update(id, { name: editName, email: editEmail })
      setEditingId(null)
      await refresh()
    })
  }

  const remove = (id: number) => {
    if (!confirm('Delete this user?')) return
    wrap(async () => { await usersApi.remove(id); await refresh() })
  }

  return (
    <div className="section">
      <h2>Create user</h2>
      <form className="form" onSubmit={create}>
        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="actions">
          <button className="btn primary" type="submit">Add</button>
        </div>
      </form>

      {error && <div className="error">{error}</div>}

      <h2>Users ({users.length})</h2>
      {users.length === 0 ? (
        <div className="empty">No users yet</div>
      ) : (
        <div className="list">
          {users.map((u) =>
            editingId === u.id ? (
              <div key={u.id} className="row">
                <div className="info" style={{ display: 'grid', gap: 6 }}>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                </div>
                <div className="ops">
                  <button className="btn primary" onClick={() => saveEdit(u.id)}>Save</button>
                  <button className="btn" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div key={u.id} className="row">
                <div className="info">
                  <div className="title">#{u.id} · {u.name}</div>
                  <div className="meta">{u.email} · {new Date(u.created_at).toLocaleString()}</div>
                </div>
                <div className="ops">
                  <button className="btn" onClick={() => startEdit(u)}>Edit</button>
                  <button className="btn danger" onClick={() => remove(u.id)}>Delete</button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}
