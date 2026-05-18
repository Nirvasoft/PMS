import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { tokenService } from '../modules/auth/services/token.service';
import { logger } from './logger';

let io: SocketServer | null = null;

export function initSocketIO(httpServer: HttpServer, frontendUrl: string): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: frontendUrl,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    path: '/socket.io',
  });

  io.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error('No token'));
      const payload = await tokenService.verifyAccessToken(token);
      socket.data.userId = payload.sub;
      socket.data.companyId = payload.companyId;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    // Join personal room for targeted notifications
    socket.join(`user:${userId}`);
    logger.info(`WS connected: user=${userId} socket=${socket.id}`);

    socket.on('disconnect', () => {
      logger.info(`WS disconnected: user=${userId} socket=${socket.id}`);
    });
  });

  logger.info('Socket.IO initialized');
  return io;
}

/** Emit a real-time in-app notification to a specific user */
export function emitNotification(userId: string, payload: {
  id: string;
  title: string;
  body: string;
  icon?: string;
  actionUrl?: string | null;
}) {
  if (!io) return;
  io.to(`user:${userId}`).emit('notification', payload);
}

export { io };
