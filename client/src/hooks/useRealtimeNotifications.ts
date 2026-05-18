import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAppSelector } from '../store';
import { notificationsApi } from '../store/api/notificationsApi';
import { useAppDispatch } from '../store';
import toast from 'react-hot-toast';

let socketInstance: Socket | null = null;

export function useRealtimeNotifications() {
  const { accessToken } = useAppSelector(s => s.auth);
  const dispatch = useAppDispatch();
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!accessToken || connectedRef.current) return;

    socketInstance = io(import.meta.env['VITE_API_URL'] || 'http://localhost:3000', {
      auth: { token: accessToken },
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });

    socketInstance.on('connect', () => {
      console.info('[WS] Connected');
      connectedRef.current = true;
    });

    socketInstance.on('notification', (payload: { id: string; title: string; body: string; icon?: string }) => {
      // Invalidate in-app notifications cache to trigger refetch
      dispatch(notificationsApi.util.invalidateTags(['InAppNotifications']));
      // Show toast
      toast(payload.title, { icon: payload.icon === 'warning' ? '⚠️' : '🔔', duration: 5000 });
    });

    socketInstance.on('disconnect', () => {
      console.info('[WS] Disconnected');
      connectedRef.current = false;
    });

    socketInstance.on('connect_error', (err) => {
      console.warn('[WS] Connection error:', err.message);
    });

    return () => {
      socketInstance?.disconnect();
      socketInstance = null;
      connectedRef.current = false;
    };
  }, [accessToken, dispatch]);
}
