import { useState } from 'react';
import Login from './Login';
import Registro from './Registro';

type Modo = 'login' | 'registro';

export default function AuthGate() {
  const [modo, setModo] = useState<Modo>('login');

  return (
    <div className="auth-gate">
      <div className="auth-card">
        <div className="auth-brand">GameClip</div>
        {modo === 'login' ? <Login /> : <Registro />}
        <button
          type="button"
          className="auth-switch"
          onClick={() => setModo(modo === 'login' ? 'registro' : 'login')}
        >
          {modo === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
        </button>
      </div>
    </div>
  );
}
