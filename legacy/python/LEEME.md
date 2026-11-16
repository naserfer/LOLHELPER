# LoL Pick Helper (overlay de champ select)

Ventana siempre arriba que te acompaña en champ select y durante la partida.

**En champ select** te dice:
- cuál de tu pool (Malphite / Garen / Illaoi) pickear y por qué
- qué banear
- la build según el daño del equipo rival (AD / AP)
- cómo jugar la línea contra tu rival: qué subir en nivel 1, plan hasta el 6, qué cambia desde el 6 y qué NO hacer (marcado PRO si viene de jugadores de alto nivel, ANÁLISIS si no)

**Durante la partida** (lee la API local del juego, como Porofessor):
- qué comprar exactamente con el oro que tenés, según los ítems de tu rival y del equipo enemigo, y por qué
- tu rival de línea: nivel, ítems, hechizos y qué cuidar de su definitiva
- la guía de línea de la fase en la que estás (antes o después del 6)
- alertas: si te saca niveles, si completó un ítem, quién va muy fuerte
- equipo rival ordenado por amenaza y timers aproximados de dragón y Barón

Para verlo encima del juego, poné el juego en **Modo ventana sin bordes** (Borderless).

## Requisitos
- Windows con **Python 3.10+** (python.org; marcá "Add to PATH" al instalar). No necesita librerías extra.

## Uso
1. Abrí el cliente de League.
2. Doble clic en **run.bat**: aparece el overlay. Arrastralo de la barra de arriba; ✕ para cerrar.
3. Si preferís la consola: **run_consola.bat**.
4. Para probarlo sin entrar a una partida: `py overlay.py --demo-support` / `--demo-partida-support` (support) o `py overlay.py --demo` / `--demo-partida` (top).

## Modo support (nuevo)
- El rol se elige solo: si el cliente te asigna **support** usa los 31 supports; si te asigna **top** usa Malphite/Garen/Illaoi. En normales o blind (sin rol asignado) usa `rol_por_defecto` de `settings.json` (`"utility"` = support, `"top"` = top).
- **Tu ADC:** toma el ADC aliado apenas lo hovea o lo lockea y suma la sinergia (WR del dúo contra lo esperable de cada uno, op.gg Emerald+). Si todavía no hay ADC, recomienda solo por matchup.
- **Línea rival:** detecta su support y su ADC cuando aparecen y calcula tu matchup contra el support.
- En partida: compra exacta (item de support, Control Ward, Oracle Lens) adaptada a lo que tiene el rival, guía de línea vs el support enemigo y ficha del ADC rival.
- Las guías de support son **ANÁLISIS** de kits (no hay planillas pro públicas de matchups de support); los números son de op.gg.

## Tu historial (nuevo)
- Con el cliente abierto, el overlay lee tus últimas partidas (hasta 100) directo del cliente, sin cuentas ni claves. Se guardan en `.cache/` y se actualizan solas al terminar cada partida.
- Fuera de champ select muestra: tu récord, con quién más jugaste en el mismo equipo, tus campeones (WR y KDA) y, de support, tu récord con cada ADC.
- En champ select de support: "Vos de support con Jinx: 4-5" y, en cada support que jugaste, tu récord. Con 3+ partidas tu récord suma un poco al puntaje (máximo ±1).
- En consola: `py overlay.py --stats`.

## Tus condiciones de victoria (nuevo)
- El overlay busca en tu historial qué números separan tus victorias de tus derrotas (muertes, participación en kills, visión por minuto, Control Wards, wards rotas, daño hecho y recibido, CC). Ejemplo: "Muertes ≤ 4: ganás 62% vs 20%".
- Para no confundir suerte con patrón: mezcla tus resultados al azar cientos de veces y solo acepta una regla si es más fuerte que el 95% de lo que aparece por azar, contando todos los números a la vez. Lo que no llega a eso se muestra como PISTA.
- Al terminar cada partida: repaso con cuáles cumpliste y cuál te costó la partida.
- En partida: las que se miden en vivo (muertes, participación, visión) con tu límite, por ejemplo "te quedan 2 muertes".

## Tamaño y pantalla
- Arrastrá la esquina ◢ para cambiar el tamaño: todo se reescala.
- ▢ (o doble clic en la barra) = pantalla completa en el monitor donde está la ventana. Si es ancho, se reparte en dos columnas.
- — = modo compacto (lo esencial).

## De dónde salen los datos
- **Winrate de cada matchup:** op.gg (top, Emerald+, parche 26.22).
- **Ítem inicial, botas y primer ítem por matchup:** Lolalytics (Emerald+). Solo uso muestras de 300 partidas o más; si no hay, va el inicial general del campeón.
- **Runas, hechizos, orden de skills y build general:** op.gg (lo más jugado del parche).
- **Tarjeta ★ Challenger (Malphite y Garen):** planillas de matchups de Federals1, jugador Challenger todas las temporadas desde 2018 (dificultad, inicio, keystone y primer ítem por rival).
- **Tips de línea:** criterio de juego, no estadística.
- Cada parche cambia: pedile a Claude que actualice `pool.json` con los datos nuevos.

## Personalizar
Todo está en **pool.json**:
- Cada matchup tiene `wr` (winrate), `games`, `score` = (winrate − 50) / 2.5, y opcionalmente `start`, `boots`, `first`, `tip`.
- `builds`: `default`, `vs_ad`, `vs_ap`.
- Para cambiar de campeón, agregá o reemplazá un bloque con el mismo formato.

Las builds y runas cambian con cada parche: actualizalas mirando u.gg o op.gg.

## Notas
- Usa la API local del cliente (LCU), la misma que usan Porofessor y Blitz. Solo **lee** datos: no pickea, no banea y no hace nada dentro de la partida.
- Si el cliente no indica quién es el top rival (pasa seguido en solo queue), asume que es el primer enemigo que aparezca como matchup de top en tu pool.
- La primera vez baja de Data Dragon (servidor oficial de Riot) los íconos de campeones, ítems, runas y hechizos, y los guarda en la carpeta `.ddragon`. Si algo se ve raro después de un parche, borrá esa carpeta.
- Pasá el mouse sobre cualquier ícono para ver el nombre. Si el overlay no entra en la pantalla, scrolleá con la rueda.
- El botón — minimiza el overlay: deja solo el rival, el ban y tu pick.
