'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../components/Icon';
import { ThemeSelector } from '../components/ui';
import { useTheme, useToast } from '../providers';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
type Tab = 'overview' | 'users' | 'reports' | 'actions';
type Overview = { users: number; activeUsers: number; suspendedUsers: number; conversations: number; messages: number; calls: number; pendingReports: number; reports: number };
type AdminUser = { id: string; username: string; displayName: string; email?: string | null; accountStatus: string; createdAt: string; lastSeenAt: string };
type Report = { id: string; reportedUsernameSnapshot: string; category: string; status: string; description: string; createdAt?: string; reporter?: { id: string; username: string; displayName: string; email?: string | null }; reportedUser?: { id: string; username: string; displayName: string; email?: string | null; accountStatus: string }; evidence?: { id: string; mimeType: string; sizeBytes: number; createdAt: string }[] };
type Action = { id: string; adminUsername: string; targetUserId: string; type: string; reason: string; createdAt: string; expiresAt?: string | null; targetUser?: { username: string; displayName: string } | null };

export default function AdminPage() {
  const toast = useToast();
  const { theme } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [token, setToken] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [userStatus, setUserStatus] = useState('ALL');
  const [busy, setBusy] = useState(false);

  async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${API}${path}`, { ...init, headers });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Admin request failed (${response.status})`);
    return data as T;
  }

  async function loadDashboard(accessToken = token) {
    const oldToken = token;
    if (accessToken !== oldToken) setToken(accessToken);
    const headers = { Authorization: `Bearer ${accessToken}` };
    const get = async <T,>(path: string): Promise<T> => {
      const response = await fetch(`${API}${path}`, { headers });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load admin data');
      return data as T;
    };
    const [stats, reportRows, userRows, actionRows] = await Promise.all([
      get<Overview>('/api/v1/admin/overview'),
      get<Report[]>('/api/v1/admin/reports'),
      get<AdminUser[]>('/api/v1/admin/users?take=50'),
      get<Action[]>('/api/v1/admin/actions'),
    ]);
    setOverview(stats); setReports(reportRows); setUsers(userRows); setActions(actionRows);
  }

  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const response = await fetch(`${API}/api/v1/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Admin login failed');
      setToken(data.accessToken);
      await loadDashboard(data.accessToken);
      toast.success('Admin session started.', 'admin-login', 'Signed in');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Admin login failed', 'admin-login-error'); }
    finally { setBusy(false); }
  }

  async function searchUsers() {
    try {
      const params = new URLSearchParams({ take: '100', status: userStatus });
      if (userQuery.trim()) params.set('q', userQuery.trim());
      setUsers(await adminFetch<AdminUser[]>(`/api/v1/admin/users?${params}`));
    } catch (error) { toast.error(error instanceof Error ? error.message : 'User search failed'); }
  }

  async function moderateUser(user: AdminUser, action: 'WARN' | 'SUSPEND' | 'BAN' | 'SOFT_DELETE' | 'RESTORE') {
    const reason = window.prompt(`Reason for ${action.replaceAll('_', ' ').toLowerCase()} @${user.username} (at least 5 characters):`);
    if (!reason || reason.trim().length < 5) return;
    try {
      const result = await adminFetch<{ accountStatus: string }>(`/api/v1/admin/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ action, reason: reason.trim() }) });
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, accountStatus: result.accountStatus } : item));
      setActions(await adminFetch<Action[]>('/api/v1/admin/actions'));
      toast.success(`User action ${action} saved.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Moderation action failed'); }
  }

  async function openEvidence(report: Report, evidenceId: string) {
    const previewWindow = window.open('', '_blank');
    try {
      const response = await fetch(`${API}/api/v1/admin/reports/${report.id}/evidence/${evidenceId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'Could not open evidence'); }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (previewWindow) previewWindow.location.href = objectUrl;
      else { const link = document.createElement('a'); link.href = objectUrl; link.download = `report-evidence-${evidenceId}`; link.click(); }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) { previewWindow?.close(); toast.error(error instanceof Error ? error.message : 'Could not open evidence'); }
  }

  async function decide(report: Report, action: 'NONE' | 'WARN' | 'SUSPEND' | 'BAN' | 'SOFT_DELETE') {
    const reason = window.prompt('Enter the moderation decision reason (required, at least 5 characters)');
    if (!reason || reason.trim().length < 5) return;
    try {
      await adminFetch(`/api/v1/admin/reports/${report.id}`, { method: 'PATCH', body: JSON.stringify({ status: action === 'NONE' ? 'DISMISSED' : 'ACTION_TAKEN', action, reason: reason.trim() }) });
      setReports((current) => current.map((item) => item.id === report.id ? { ...item, status: action === 'NONE' ? 'DISMISSED' : 'ACTION_TAKEN' } : item));
      setActions(await adminFetch<Action[]>('/api/v1/admin/actions'));
      toast.success('Moderation decision saved.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Decision failed'); }
  }

  const tabs: { id: Tab; label: string }[] = [{ id: 'overview', label: 'Overview' }, { id: 'users', label: 'Users' }, { id: 'reports', label: 'Reports' }, { id: 'actions', label: 'Moderation log' }];
  const cards = useMemo(() => overview ? [
    ['Total users', overview.users], ['Active users', overview.activeUsers], ['Suspended users', overview.suspendedUsers],
    ['Conversations', overview.conversations], ['Messages', overview.messages], ['Calls', overview.calls],
    ['Pending reports', overview.pendingReports], ['All reports', overview.reports],
  ] as [string, number][] : [], [overview]);

  return <main className="admin-shell" data-admin-theme={theme}>
    <header className="admin-header">
      <div><Link href="/" className="admin-back"><Icon name="back" size={16}/> Back to Connectly</Link><h1>Connectly Admin</h1><p className="muted">Platform overview, account management and moderation.</p></div>
      <div className="admin-header-actions"><span className="admin-badge"><Icon name="shield" size={15}/> Administrator</span>{token && <button className="button secondary small" onClick={() => { setToken(''); setPassword(''); setOverview(null); }}>Sign out</button>}</div>
    </header>

    {!token ? <section className="panel admin-login"><div className="panel-head"><h2>Admin sign in</h2></div>
      <p className="panel-help">Use the credentials configured in the backend environment. This is separate from regular Connectly accounts.</p>
      <form className="stack-form" onSubmit={login}>
        <label className="field"><span>Admin username</span><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required/></label>
        <label className="field"><span>Admin password</span><div className="password-input-wrap"><input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} autoComplete="current-password" required/><button type="button" className="password-visibility" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}><Icon name={showPassword ? 'eyeOff' : 'eye'} size={18}/></button></div></label>
        <button type="submit" className="button primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </section> : <>
      <nav className="admin-tabs" aria-label="Admin dashboard sections">{tabs.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}{item.id === 'reports' && overview?.pendingReports ? <span className="admin-tab-count">{overview.pendingReports}</span> : null}</button>)}</nav>
      {tab === 'overview' && <section className="admin-stats-grid">{cards.map(([label, value]) => <article className="panel admin-stat" key={label}><span>{label}</span><strong>{value.toLocaleString()}</strong></article>)}</section>}
      {tab === 'users' && <section className="panel admin-users-panel">
        <div className="panel-head"><h2>User management ({users.length})</h2></div>
        <form className="admin-user-search" onSubmit={(event) => { event.preventDefault(); void searchUsers(); }}>
          <input value={userQuery} onChange={(event) => setUserQuery(event.target.value)} placeholder="Search username, display name or email"/>
          <select value={userStatus} onChange={(event) => setUserStatus(event.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="BANNED">Banned</option><option value="DELETED">Deleted</option></select>
          <button className="button primary small" type="submit">Search</button>
        </form>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>User</th><th>Email</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.displayName}</strong><small>@{user.username}</small></td><td>{user.email || '—'}</td><td><span className={`admin-status status-${user.accountStatus.toLowerCase()}`}>{user.accountStatus}</span></td><td>{new Date(user.createdAt).toLocaleDateString()}</td><td><div className="admin-actions">{user.accountStatus === 'ACTIVE' ? <><button className="button small secondary" onClick={() => void moderateUser(user, 'WARN')}>Warn</button><button className="button small danger-ghost" onClick={() => void moderateUser(user, 'SUSPEND')}>Suspend</button><button className="button small danger-ghost" onClick={() => void moderateUser(user, 'BAN')}>Ban</button><button className="button small danger-ghost" onClick={() => { if (window.confirm(`Deactivate @${user.username}? This is a reversible soft delete.`)) void moderateUser(user, 'SOFT_DELETE'); }}>Delete</button></> : <button className="button small secondary" onClick={() => void moderateUser(user, 'RESTORE')}>Restore</button>}</div></td></tr>)}</tbody></table></div>
      </section>}
      {tab === 'reports' && <section className="admin-reports"><div className="panel-head"><h2>Reports ({reports.length})</h2><span className="panel-note">Oldest first</span></div>
        {!reports.length && <p className="panel-message">No reports have been filed.</p>}
        <div className="admin-report-list">{reports.map((report) => <article key={report.id} className="panel admin-report">
          <div className="admin-report-head"><div><strong>@{report.reportedUsernameSnapshot}</strong><p className="muted">Reported user: {report.reportedUser?.displayName || report.reportedUsernameSnapshot} (@{report.reportedUser?.username || report.reportedUsernameSnapshot}){report.reportedUser?.email ? ` · ${report.reportedUser.email}` : ''}</p><p className="muted">Reported by: {report.reporter?.displayName || 'Unknown'} (@{report.reporter?.username || 'unknown'}){report.reporter?.email ? ` · ${report.reporter.email}` : ''}</p><p className="muted">{report.category.replaceAll('_', ' ').toLowerCase()} · Filed {new Date(report.createdAt || Date.now()).toLocaleString()}</p></div><span className={`admin-status status-${report.status.toLowerCase()}`}>{report.status.replaceAll('_', ' ')}</span></div>
          <p className="admin-description">{report.description}</p><div className="admin-evidence"><strong>Evidence ({report.evidence?.length || 0})</strong>{report.evidence?.length ? report.evidence.map((file) => <button type="button" className="button ghost small" key={file.id} onClick={() => void openEvidence(report, file.id)}><Icon name="file" size={14}/> View {file.mimeType.split('/')[1]?.toUpperCase() || 'FILE'} · {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB</button>) : <span className="panel-help">No proof attached.</span>}</div>
          {report.status === 'PENDING' && <div className="admin-actions">{(['NONE', 'WARN', 'SUSPEND', 'BAN', 'SOFT_DELETE'] as const).map((action) => <button key={action} className={`button small ${action === 'NONE' ? 'ghost' : action === 'SUSPEND' || action === 'BAN' || action === 'SOFT_DELETE' ? 'danger-ghost' : 'secondary'}`} onClick={() => void decide(report, action)}>{action === 'NONE' ? 'Dismiss' : action.replaceAll('_', ' ')}</button>)}</div>}
        </article>)}</div>
      </section>}
      {tab === 'actions' && <section className="panel admin-action-log"><div className="panel-head"><h2>Moderation log</h2><span className="panel-note">Latest 100 actions</span></div>{!actions.length && <p className="panel-message">No moderation actions recorded.</p>}{actions.map((action) => <article className="admin-log-row" key={action.id}><div><strong>{action.type.replaceAll('_', ' ')} · @{action.targetUser?.username || action.targetUserId.slice(0, 8)}</strong><p>{action.reason}</p><small>{action.adminUsername} · {new Date(action.createdAt).toLocaleString()}</small></div></article>)}</section>}
      <section className="panel admin-theme"><div className="panel-head"><h2>Admin theme</h2><span className="panel-note">Shared with the main app</span></div><ThemeSelector compact/></section>
    </>}
  </main>;
}
