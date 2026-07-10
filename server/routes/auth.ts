import { Router, type Response } from 'express';
import { requireAuth } from '../auth/auth.middleware';
import { AuthError, type AuthService } from '../auth/auth.service';

function toResponse(res: Response, err: unknown): void {
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.message });
  } else {
    res.status(500).json({ error: 'Error interno.' });
  }
}

export function authRouter(auth: AuthService): Router {
  const router = Router();

  router.post('/auth/register', async (req, res) => {
    const { email, password, displayName } = req.body ?? {};
    try {
      const session = await auth.register(String(email ?? ''), String(password ?? ''), String(displayName ?? ''));
      res.status(201).json(session);
    } catch (err) {
      toResponse(res, err);
    }
  });

  router.post('/auth/login', async (req, res) => {
    const { email, password } = req.body ?? {};
    try {
      const session = await auth.login(String(email ?? ''), String(password ?? ''));
      res.json(session);
    } catch (err) {
      toResponse(res, err);
    }
  });

  router.post('/auth/refresh', (req, res) => {
    const { refreshToken } = req.body ?? {};
    try {
      const session = auth.refresh(String(refreshToken ?? ''));
      res.json(session);
    } catch (err) {
      toResponse(res, err);
    }
  });

  router.post('/auth/logout', (req, res) => {
    const { refreshToken } = req.body ?? {};
    auth.logout(String(refreshToken ?? ''));
    res.status(204).end();
  });

  router.get('/auth/me', requireAuth(auth), (req, res) => {
    try {
      res.json({ user: auth.getUser(req.userId!) });
    } catch (err) {
      toResponse(res, err);
    }
  });

  return router;
}
