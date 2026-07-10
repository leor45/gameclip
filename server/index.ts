import { SERVER_PORT } from '../src/shared/config';
import { createApp } from './app';
import { openDatabase } from './db/database';

const db = openDatabase();
const app = createApp(db);

app.listen(SERVER_PORT, () => {
  console.log(`[server] GameClip API escuchando en http://localhost:${SERVER_PORT}`);
});
