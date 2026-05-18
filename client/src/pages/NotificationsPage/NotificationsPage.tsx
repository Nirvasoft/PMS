import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetInAppNotificationsQuery,
  useMarkAsReadMutation,
  useMarkAllReadMutation,
  useDeleteNotificationMutation,
} from '../../store/api/notificationsApi';

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useGetInAppNotificationsQuery({
    ...(filter === 'unread' ? { isRead: 'false' } : {}),
    page: String(page),
    limit: '20',
  });

  const [markAsRead] = useMarkAsReadMutation();
  const [markAllRead] = useMarkAllReadMutation();
  const [deleteNotif] = useDeleteNotificationMutation();

  const notifications = data?.data ?? [];
  const meta = data?.meta;
  const unreadCount = meta?.unreadCount ?? 0;

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  const iconMap: Record<string, string> = {
    bell: '🔔', home: '🏠', user: '👤', 'git-branch': '🔀',
    'file-text': '📄', tool: '🔧', 'dollar-sign': '💰',
    'check-circle': '✅', 'alert-triangle': '⚠️',
  };

  const handleClick = async (n: typeof notifications[0]) => {
    if (!n.isRead) await markAsRead(n.id);
    if (n.actionUrl) navigate(n.actionUrl);
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>🔔 Notifications</h1>
        <p className="text-secondary">
          {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}` : 'All caught up!'}
        </p>
      </div>

      <div className="toolbar">
        <div className="filter-group">
          <button className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : ''}`}
            onClick={() => { setFilter('all'); setPage(1); }}>All</button>
          <button className={`btn btn-sm ${filter === 'unread' ? 'btn-primary' : ''}`}
            onClick={() => { setFilter('unread'); setPage(1); }}>
            Unread {unreadCount > 0 && `(${unreadCount})`}
          </button>
        </div>
        {unreadCount > 0 && (
          <button className="btn btn-sm" onClick={() => markAllRead()}>✓ Mark all read</button>
        )}
      </div>

      {isLoading ? (
        <div className="loading-inline"><div className="loading-spinner" /> Loading...</div>
      ) : notifications.length === 0 ? (
        <div className="notif-empty-state">
          <div className="notif-empty-icon">🔔</div>
          <h3>{filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}</h3>
          <p className="text-muted">When something happens, you'll see it here.</p>
        </div>
      ) : (
        <div className="notif-list">
          {notifications.map((n) => (
            <div key={n.id} className={`notif-list-item ${n.isRead ? '' : 'unread'}`}>
              <div className="notif-list-icon">{iconMap[n.icon] || '🔔'}</div>
              <div className="notif-list-content" onClick={() => handleClick(n)}>
                <div className="notif-list-title">
                  {n.title}
                  {!n.isRead && <span className="notification-dot" />}
                </div>
                <div className="notif-list-body">{n.body}</div>
                <div className="notif-list-time">{timeAgo(n.createdAt)}</div>
              </div>
              <div className="notif-list-actions">
                {!n.isRead && (
                  <button className="btn btn-sm" onClick={() => markAsRead(n.id)} title="Mark read">✓</button>
                )}
                <button className="btn btn-sm" onClick={() => deleteNotif(n.id)} title="Delete">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="pagination">
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
          <span className="text-secondary">Page {meta.page} of {meta.totalPages}</span>
          <button className="btn btn-sm" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
