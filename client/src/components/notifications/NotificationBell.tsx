import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetInAppNotificationsQuery,
  useMarkAsReadMutation,
  useMarkAllReadMutation,
} from '../../store/api/notificationsApi';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { data } = useGetInAppNotificationsQuery(
    { limit: '10' },
    { pollingInterval: 30000 }, // Poll every 30s for new notifications
  );

  const [markAsRead] = useMarkAsReadMutation();
  const [markAllRead] = useMarkAllReadMutation();

  const notifications = data?.data ?? [];
  const unreadCount = data?.meta?.unreadCount ?? 0;

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleClick = async (n: typeof notifications[0]) => {
    if (!n.isRead) {
      await markAsRead(n.id);
    }
    if (n.actionUrl) {
      navigate(n.actionUrl);
    }
    setOpen(false);
  };

  const handleMarkAllRead = async () => {
    await markAllRead();
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const iconMap: Record<string, string> = {
    bell: '🔔', home: '🏠', user: '👤', 'git-branch': '🔀',
    'file-text': '📄', tool: '🔧', 'dollar-sign': '💰',
    'check-circle': '✅', 'alert-triangle': '⚠️',
  };

  return (
    <div className="notification-bell-container" ref={dropdownRef}>
      <button className="notification-bell-btn" onClick={() => setOpen(!open)} id="notification-bell">
        🔔
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notification-dropdown">
          <div className="notification-dropdown-header">
            <h4>Notifications</h4>
            {unreadCount > 0 && (
              <button className="btn-link" onClick={handleMarkAllRead}>Mark all read</button>
            )}
          </div>

          <div className="notification-dropdown-list">
            {notifications.length === 0 ? (
              <div className="notification-empty">No notifications</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`notification-item ${n.isRead ? '' : 'unread'}`}
                  onClick={() => handleClick(n)}
                >
                  <span className="notification-icon">{iconMap[n.icon] || '🔔'}</span>
                  <div className="notification-content">
                    <div className="notification-title">{n.title}</div>
                    <div className="notification-body">{n.body}</div>
                    <div className="notification-time">{timeAgo(n.createdAt)}</div>
                  </div>
                  {!n.isRead && <span className="notification-dot" />}
                </div>
              ))
            )}
          </div>

          <div className="notification-dropdown-footer">
            <button className="btn-link" onClick={() => { navigate('/notifications'); setOpen(false); }}>
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
