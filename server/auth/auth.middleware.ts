import type { NextFunction, Request, Response } from 'express';
import type { AuthService } from './auth.service';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: number;
  }
}

export function requireAuth(auth: AuthService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (!token) {
      res.status(401).json({ error: 'Falta el token de acceso.' });
      return;
    }
    try {
      req.userId = auth.verifyAccess(token);
      next();
    } catch {
      res.status(401).json({ error: 'Token inválido o expirado.' });
    }
  };
}
