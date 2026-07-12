# Misión — GameClip

## Qué es el producto

**GameClip** es una aplicación de escritorio para Windows que captura clips de videojuegos y graba
el escritorio, con todas las funciones que las apps de clips comerciales reservan a sus planes de
pago. El usuario juega con la app corriendo en segundo plano y, con una tecla rápida, guarda
retroactivamente los últimos segundos de juego (clip retroactivo), inicia grabaciones manuales o
graba el escritorio completo.

## Para quién es

Jugadores de PC que quieren capturar sus mejores momentos sin fricción: sin configurar OBS, sin
perder rendimiento notable en el juego, y con una biblioteca donde revisar, recortar y compartir
sus clips.

## Alcance del producto (fase actual)

**Incluido — todo lo que las apps de clips cobran como premium:**
- Clip retroactivo (buffer de repetición) con tecla rápida configurable.
- Grabación manual de juego y de escritorio, con audio de sistema y micrófono.
- Calidad de captura premium: sin marca de agua, resolución/bitrate/FPS configurables (hasta la
  calidad que permita el hardware), aceleración por GPU (NVENC/AMF/QSV).
- Biblioteca local de clips con metadatos (juego, fecha, duración, etiquetas).
- Editor de clips: recorte, y progresivamente el resto de herramientas de un editor completo.
- Cuentas de usuario con registro/login directo (email + contraseña).

**Excluido por ahora (en roadmap como futuro):**
- Guardado en la nube y compartir alojado en nuestros servidores.
- Login social (Discord, Google, etc.).

## Principios de producto

1. **El clip nunca se pierde.** La captura retroactiva es la razón de ser de la app; su fiabilidad
   está por encima de cualquier otra funcionalidad.
2. **Rendimiento primero.** La captura no debe degradar la experiencia de juego; por eso la captura
   es nativa (libobs) desde el día uno, no basada en APIs web.
3. **Paridad con las apps de clips del mercado.** Ante una duda de diseño o comportamiento, la
   referencia es el comportamiento habitual de las apps de clips comerciales.
4. **Local primero.** Todos los clips viven en el disco del usuario; el backend solo gestiona
   cuentas y metadatos. La nube llegará después sin romper este modelo.
