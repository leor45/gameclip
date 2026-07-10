import { useState, type FormEvent } from 'react';
import { PASSWORD_MIN_LENGTH } from '@shared/auth';
import { useAuth } from './AuthContext';

export default function Registro() {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await register({ email, password, displayName });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={onSubmit}>
      <h1>Crear cuenta</h1>
      <label>
        Nombre para mostrar
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          autoComplete="nickname"
          required
        />
      </label>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </label>
      <label>
        Contraseña
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
        />
      </label>
      {error && <p className="auth-error">{error}</p>}
      <button type="submit" disabled={enviando}>
        {enviando ? 'Creando…' : 'Crear cuenta'}
      </button>
    </form>
  );
}
