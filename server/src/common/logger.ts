import winston from 'winston';
import { config } from './config';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ timestamp, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}: ${message}${metaStr}${stack ? '\n' + stack : ''}`;
  }),
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  winston.format.json(),
);

export const logger = winston.createLogger({
  level: config.env === 'production' ? 'info' : 'debug',
  format: config.env === 'production' ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
  defaultMeta: { service: 'pms-api' },
});
