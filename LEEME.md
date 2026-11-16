# Pick Helper 2.0

Coach de League of Legends para support (y tu pool de top). Una sola app: `PickHelper.exe`.

## Cómo se usa
1. Doble clic en `PickHelper.exe`. La primera vez Windows puede mostrar "Windows protegió tu PC" porque la app no está firmada: **Más información → Ejecutar de todas formas**.
2. Abrí el cliente de League. El overlay se conecta solo.
3. Jugá en ventana **Sin bordes** (Borderless) para que el overlay quede arriba del juego.

Botones de la barra: alfiler (siempre arriba), minimizar, pantalla completa en el monitor actual (o doble clic en la barra) y cerrar. Se arrastra desde la barra y se agranda desde los bordes; recuerda la posición y el tamaño.

## Qué hace
- **Champ select:** supports recomendados por matchup, sinergia con tu ADC (op.gg Emerald+, parche 26.22) y tu propio historial. Para top, tu pool Malphite/Garen/Illaoi.
- **En partida:** qué comprar exactamente con tu oro, guía de línea, rival, alertas y objetivos.
- **Autopsia de muertes (nuevo):** cada vez que morís, te dice por qué (oro sin gastar, la jungla rival, inferioridad numérica, bajo torre, tu ADC ya había caído, abajo de nivel, pelea de objetivo). Después de cada partida ves la autopsia completa y el resumen de por qué morís más seguido.
- **Tu plan hasta el minuto 14:** el overlay graba lo que hacés hasta el 14 (muertes, visión, Control Wards, oro, primer ítem). Aprende por rol: usa las partidas anteriores para buscar patrones y las posteriores para comprobar si se repiten. Requiere 20 partidas de entrenamiento y al menos 5 victorias y 5 derrotas para validar; hasta entonces muestra cuánto falta. Las condiciones de partida completa también se separan por rol y se validan con partidas posteriores.

Una partida cuenta como completa si el overlay estuvo abierto desde el principio y no perdió la lectura por más de un minuto antes del 14.

## Reglas de Riot
Solo usa la API del cliente y la API en vivo del juego (las mismas que usan las apps aprobadas). No lee la memoria del juego, no automatiza nada y no muestra timers de habilidades ni hechizos del rival.

## Dónde guarda tus datos
`%APPDATA%\Pick Helper` (historial, partidas grabadas, ajustes). Borrando esa carpeta empieza de cero.

## Lista de ítems
La app solo te recomienda comprar ítems que estén en `data/items.json` (parche 16.22.1, sacada de Data Dragon de Riot). Cuando salga un parche que saque o agregue ítems, editá ese archivo: borrá los que ya no existen y sumá los nuevos con su id y nombre en inglés. Después tenés que volver a armar el `.exe`.
