import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAppSelector, useAppDispatch } from '../store';
import { maintenanceApi } from '../store/api/maintenanceApi';
import toast from 'react-hot-toast';

/**
 * Real-time WebSocket hook for the Maintenance module.
 *
 * Connects to the Socket.IO server and listens for maintenance events:
 * - ticket:created → invalidates ticket list + stats
 * - ticket:assigned → invalidates ticket list + detail + stats
 * - ticket:updated → invalidates ticket list + detail (covers WO start/hold/resume)
 * - ticket:completed → invalidates everything
 * - ticket:escalated → invalidates ticket detail
 * - ticket:cancelled → invalidates ticket list + stats
 * - ticket:rated → invalidates ticket list + detail
 *
 * Uses the shared socket connection from useRealtimeNotifications if available,
 * or creates its own connection.
 */

let socketRef: Socket | null = null;

export function useMaintenanceSocket() {
  const { accessToken } = useAppSelector((s) => s.auth);
  const dispatch = useAppDispatch();
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!accessToken || connectedRef.current) return;

    // Reuse existing socket if available, otherwise create one
    if (!socketRef) {
      socketRef = io(import.meta.env['VITE_API_URL'] || 'http://localhost:3000', {
        auth: { token: accessToken },
        path: '/socket.io',
        transports: ['websocket', 'polling'],
      });
    }

    const socket = socketRef;

    const invalidateTickets = () => {
      dispatch(maintenanceApi.util.invalidateTags(['Tickets', 'MaintenanceStats']));
    };

    const invalidateTicketDetail = (ticketId: string) => {
      dispatch(maintenanceApi.util.invalidateTags([
        { type: 'TicketDetail', id: ticketId },
        'Tickets',
        'MaintenanceStats',
      ]));
    };

    // ── Event Handlers ──────────────────────────

    socket.on('ticket:created', (data: { ticketId: string; ticketNumber: string; priority: string }) => {
      invalidateTickets();
      toast(`New ticket ${data.ticketNumber} (${data.priority})`, { icon: '🔧', duration: 4000 });
    });

    socket.on('ticket:assigned', (data: { ticketId: string; ticketNumber: string }) => {
      invalidateTicketDetail(data.ticketId);
    });

    socket.on('ticket:updated', (data: { ticketId: string; status: string }) => {
      invalidateTicketDetail(data.ticketId);
    });

    socket.on('ticket:completed', (data: { ticketId: string }) => {
      invalidateTicketDetail(data.ticketId);
      dispatch(maintenanceApi.util.invalidateTags(['WorkOrders']));
    });

    socket.on('ticket:escalated', (data: { ticketId: string }) => {
      invalidateTicketDetail(data.ticketId);
    });

    socket.on('ticket:cancelled', (data: { ticketId: string; ticketNumber: string }) => {
      invalidateTickets();
    });

    socket.on('ticket:rated', (data: { ticketId: string }) => {
      invalidateTicketDetail(data.ticketId);
    });

    socket.on('connect', () => {
      connectedRef.current = true;
    });

    socket.on('disconnect', () => {
      connectedRef.current = false;
    });

    return () => {
      // Clean up event listeners (but don't disconnect — shared socket)
      socket.off('ticket:created');
      socket.off('ticket:assigned');
      socket.off('ticket:updated');
      socket.off('ticket:completed');
      socket.off('ticket:escalated');
      socket.off('ticket:cancelled');
      socket.off('ticket:rated');
      connectedRef.current = false;
    };
  }, [accessToken, dispatch]);
}
