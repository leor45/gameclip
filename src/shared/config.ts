// Configuración compartida entre app y server.

export const SERVER_PORT = 3030;
/**
 * La API solo escucha en el propio PC. Se usa la IP y no `localhost`: `localhost` puede resolver a `::1`
 * y quedar fuera del enlace.
 */
export const SERVER_HOST = '127.0.0.1';
export const SERVER_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;
