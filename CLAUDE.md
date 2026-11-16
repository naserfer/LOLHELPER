# Pick Helper: guía para la próxima IA (o programador)

Leé esto entero antes de tocar código. El `LEEME.md` es para el jugador; este archivo es para quien mantiene el proyecto.

## Qué es
Una app de escritorio para Windows (Electron, un `.exe` portable) que ayuda a jugar League of Legends:
- **Champ select:** recomienda campeón según el matchup (op.gg), la sinergia con el ADC aliado y el historial propio.
- **En partida:** qué comprar exactamente con el oro actual según los ítems del rival, la guía de línea y las alertas.
- **Overlay dentro del juego (HUD):** una ventana transparente que deja pasar los clics y muestra la compra, el aviso de muerte y el límite de muertes hasta el 14.
- **Coach post-partida:** autopsia de cada muerte, "plan hasta el minuto 14" aprendido de las partidas del jugador e historial.

Hay **dos builds**, que comparten el mismo código y se separan por *perfil*:

| Perfil | Jugador | Roles | Campeones | Datos | Ejecutable / carpeta de datos |
|---|---|---|---|---|---|
| `naser` | Naser (dueño del proyecto), Plat 3 | support (+ top) | 31 supports; top: Malphite, Garen, Illaoi | op.gg Emerald+ | `PickHelper.exe` · `%APPDATA%\Pick Helper` |
| `bitty` | Bitty (amigo), Master | jungla, mid | Nocturne y Diana (jungla), Diana (mid) | op.gg Master+ | `PickHelper-Bitty.exe` · `%APPDATA%\Pick Helper Bitty` |

## Preferencias del usuario (importan)
- Todo en **español rioplatense/paraguayo con voseo** ("comprá", "jugá"). Textos cortos y concretos.
- Quiere **detalle y datos reales**, no consejos genéricos. Cada número tiene que tener fuente.
- **Honestidad en las etiquetas:** las guías de Federals1 (planilla Challenger) se marcan `PRO`; las demás, `ANÁLISIS` (análisis de kits). No inventar que algo es de un pro.
- En partida **no quiere winrates ni runas**, solo qué hacer y qué comprar.
- **No quiere timers de jungla/objetivos:** el juego ya los muestra en el minimapa desde el parche 25.17. Se sacaron a pedido suyo; no volver a ponerlos.
- El overlay tiene que molestar lo mínimo: poco texto, que aparezca solo cuando sirve, que no robe el foco.
- Su monitor izquierdo es chico: la interfaz tiene que funcionar desde 340 px de ancho.
- **Nunca perder sus datos** al actualizar (ver "Compatibilidad").

## Reglas de Riot (no negociables)
- Solo se usan la **API del cliente (LCU)** y la **Live Client Data API** (`https://127.0.0.1:2999`). Nada de leer memoria del juego, inyectar ni automatizar.
- **Prohibido** mostrar timers de habilidades definitivas o de hechizos de invocador del rival.
- Las peticiones al cliente son **solo GET** (hay una prueba que lo verifica).
- Los timers de campamentos de jungla no se pueden obtener de la API oficial, y además el juego ya los trae.

## Estructura
```
main.js                 Proceso principal de Electron: ventana, bucle de 1 s, HUD, atajos, protocolo pickhelper://, autopruebas
preload.js              Puente seguro renderer <-> main (window.ph)
renderer/               Interfaz: index.html + app.js + style.css (ventana principal); hud.* (overlay en el juego)
src/sig.js              Firma de la vista: si no cambia, no se redibuja (evita titileo)
src/hud.js              Qué muestra el HUD y posiciones por defecto (% de pantalla)
src/engine/
  engine.js             Orquesta todo: perfil, cliente, partida, historial, grabador, coach
  lcu.js                Credenciales del cliente (PowerShell o lockfile; LOL_PATH lo pisa) y HTTPS a 127.0.0.1
  ddragon.js            Data Dragon (campeones, ítems, runas) con caché; íconos de ítems desde el cliente
  itemdb.js             Recetas y "qué comprar con X de oro" (planPurchase)
  select.js             Champ select: analyzeLane (top/jungla/mid) y analyzeSupport (+ sinergia ADC)
  ingame.js             Partida en vivo: rival, compra adaptativa (BUILD_RULES, supportRules), alertas, guía
  history.js            Historial desde el cliente (últimas 100 partidas, en historial/)
  wincons.js            Reglas "si cumplís X ganás Y%" con prueba de permutación (Westfall-Young)
  recorder.js           Graba cada partida: foto del minuto 14 + contexto de cada muerte (partidas/*.json)
  autopsy.js            Clasifica la causa de cada muerte
  util.js               Counter, round1 (redondeo como Python), PRNG con semilla
data/
  profile.json          Perfil activo ({ "id": "naser" }); build_win.sh lo cambia al armar
  profiles/*.json       Roles, pools y demos de cada perfil
  pool*.json            Datos por campeón (ver "Formato de datos")
  demo_*.json           Sesiones y partidas de ejemplo para --demo
tools/datos/            Scripts que generan pool*.json a partir de datos crudos (top, support, bitty)
test/                   Todas las pruebas (ver "Pruebas")
legacy/python/          Versión anterior en Python/Tkinter. Solo se usa para la prueba de equivalencia
build/                  Íconos y configuración de electron-builder para Bitty
build_win.sh            Arma el .exe desde Linux con Wine
```

## Flujo
1. `main.js` llama a `engine.step()` cada 1 s.
2. Si la Live API responde, la vista es la partida: `ingame.analyzeGame`. Además el grabador registra la partida y se arma la vista del HUD.
3. Si no, la vista es el champ select de la LCU (`select.*`), o `null`, que es la pantalla de coach/repaso.
4. Si el juego deja de responder, se sigue mostrando la última lectura buena durante 20 s, para que no titile.
5. `viewSig` decide si se redibuja todo o solo se actualizan números (oro, tiempo, faltante).
6. Al terminar la partida se recalcula el coach, se refresca el historial y la grabación se une con el resultado: por `gameId`, o si no, por campeón y hora.

## Perfiles y roles
- La posición asignada en champ select (`top|jungle|middle|bottom|utility`) elige el pool, si el perfil tiene ese rol. Si no, usa `rol_por_defecto` de los ajustes.
- `kind: "support"` usa `analyzeSupport` (con ADC aliado y sinergia). `kind: "lane"` usa `analyzeLane`.
- En partida, el rol sale de `position` de la Live API (`JUNGLE`→`jungle`, `MIDDLE`→`mid`…). `BUILD_RULES` acepta claves `Campeón|rol`, por ejemplo `Diana|jungle` y `Diana|mid`, porque arman distinto.
- `track_adc: false` (Bitty) desactiva la causa de muerte "tu ADC ya había caído".
- Para correr otro perfil en desarrollo: `PH_PROFILE=bitty npm start`.

## Formato de datos (pool*.json)
`{ patch, source, pool: [campeón] }`. Cada campeón tiene:
- `name`, `role`, `start`, `boots`, `builds{default,vs_ad,vs_ap}`, `runes`, `spells`, `skills`, `general`.
- `matchups{rival: {wr, games, score, guide?, start?, boots?, first?, pro?}}`.
- Top además tiene `blind` y `comp_bonus`. Support además tiene `arch`, `tier_wr`, `pick`, `plan`, `threat` y `synergy{adc:{delta,games}}`. El archivo de support trae también `dyn`, `arch_label` y `adc_arch`.

Fórmulas:
- **score de matchup** = `(wr-50)/2.5`, reducido proporcionalmente si hay menos de 300 partidas.
- **Puntaje de support** = `(tier_wr-50)/1.5 + 3·score vs support rival + 2·clamp(sinergia/1.2)`. Si el dúo no tiene datos: estimación por tipo de support × 1. Historial propio: ±1 como máximo, con 3 o más partidas.
- **Sinergia** = WR del dúo − promedio del support − efecto propio del ADC (ponderado). Mezcla las páginas de op.gg del lado del support y del lado del ADC: cada una solo lista su top 10.

Para actualizar datos a un parche nuevo:
1. Volver a bajar de op.gg con la misma estructura. URLs del tipo `op.gg/lol/champions/<champ>/counters/<rol>?tier=master_plus&patch=XX.YY` y `.../synergies/support` o `.../synergies/adc`. Lolalytics y League of Graphs cargan las tablas con JS y no se pueden leer.
2. Pegar los datos en `tools/datos/*/raw*`.
3. Correr el `build*.py` que corresponda; escribe en `data/`.
4. Correr las pruebas.

Op.gg muestra el parche como `16.22`; el jugador lo llama `26.22`. Es el mismo parche.

## Algoritmos clave
- **Compra (`itemdb.planPurchase`):** calcula el costo restante descontando los componentes que ya tenés. Si no te alcanza para el ítem completo, busca la mejor combinación de componentes que sí podés pagar. Si sobra oro, encadena el siguiente ítem y suma una Control Ward si te alcanza.
- **Reglas (`wincons.learn`):** para cada número busca el mejor corte con al menos 7 partidas por lado. Las winrates se encogen hacia 50% (prior 5/5). Una regla vale solo si supera el 95% del máximo que sale con resultados mezclados al azar (300 permutaciones, con todos los números a la vez). Las que no llegan pero tienen p ≤ 0,3 se muestran como `PISTA`.
  - Reglas **tempranas** (`EARLY`, foto del 14): se aprenden por rol. Las partidas antiguas (65%) entrenan; las posteriores (35%) validan. Hacen falta 20 partidas de entrenamiento y al menos 5 victorias y 5 derrotas posteriores (31 partidas completas por rol como mínimo). Solo se activan reglas con al menos 5 partidas a cada lado del corte, diferencia favorable en validación y `p ≤ 0,05` tras permutar resultados entre todas las candidatas.
  - Reglas de **partida completa** (`FULL`): también se separan y validan por rol con el mismo criterio. Se muestran como "menos confiables", porque sus números pueden ser consecuencia de ir ganando.
  - Las grabaciones nuevas guardan `role`. Para grabaciones viejas sin rol se infiere solo si el campeón pertenece a un único pool del perfil; las ambiguas no entrenan el coach.
- **Autopsia:** las etiquetas son `torre`, `jungla`, `superado` (3 o más), `adc` (cayó ≤12 s antes), `nivel` (+2), `oro` (≥1000) y `objetivo` (dentro de −10/+45 s de un dragón, barón o heraldo). Si ninguna aplica, es `clara`. La principal se elige por prioridad. Los nombres de los eventos se comparan con `riotId`, `riotIdGameName` y `summonerName`, con o sin `#TAG`.
- **Eventos:** se deduplican por contenido (`nombre|tiempo|víctima|asesino`), no solo por `EventID`.

## Pruebas
`DISPLAY=:9 npm test`, con Xvfb levantado: `Xvfb :9 -screen 0 2560x1440x24 &`. Corre:
- `test/golden/compare.js`: la versión JS da exactamente lo mismo que la Python (395 casos). Usa `items_golden.json` congelado; **no lo modifiques**. Para agregar ítems de prueba usá `test/items_test.json`.
- `test/new_features.js`: pruebas pensadas para fallar si la idea está mal: causa al revés, autopsia, grabación con cortes y que no titile.
- `test/e2e.js` y `test/bitty_test.js`: de punta a punta contra un cliente y un juego simulados por HTTPS (`test/fake_riot.js`; la API en vivo usa el puerto 2999 de verdad).
- `test/ui.js` y `test/ui_bitty.js`: cada pantalla a 340, 460, 800 y 1600 px. Verifica que no haya errores JS, que nada se salga de la ventana, cuántas columnas hay y el texto esperado.
- `test/hud_test.js`: el HUD en 1366×768, 1920×1080 y 2560×1440. Verifica que no tome el foco, que no se pisen los recuadros y que ocupe menos del 6% de la pantalla.
- `test/upgrade_test.js`: actualizar no borra ni cambia los datos del usuario.

Flags útiles de la app:
- `--demo=<nombre>`: los nombres están en el perfil, más `idle`, `gamedeath` y `jgdeath`.
- `--offline=test/offline.json`: Data Dragon sin internet.
- `--icons=test/icons.json`
- `--userdir=<dir>`
- `--size=WxH`
- `--shot=archivo.png` y `--wait=ms`
- `--selftest=out.json`
- `--hudtest=out.json`, `--hudsize=WxH` y `--hudedit`
- `--coach-fixture=full|few`

`test/sim_server.js <lockdir>` simula una sesión en tiempo real para probar el `.exe` con Wine (`SIM_ROLE=jungle` para Bitty).

## Armar los .exe
`./build_win.sh naser` y `./build_win.sh bitty`. Generan `dist/PickHelper.exe` y `dist-bitty/PickHelper-Bitty.exe`.
- Necesita `wine` y `wine32`, y un prefijo con soporte de 32 bits (`WINEPREFIX=/tmp/wp`, creado con `wineboot -i`). El lanzador portable de NSIS es de 32 bits.
- El ícono se pone con `rcedit-x64.exe` vía Wine. El `rcedit` de 32 bits de electron-builder falla sin wine32, por eso `signAndEditExecutable: false`.
- El script cambia `data/profile.json` y el ícono temporalmente, y los restaura al salir (trap).
- En Windows también se puede usar `npx electron-builder --win portable` (perfil naser) o `--config build/bitty.json`.

## Compatibilidad (no romper)
- **No cambiar** `productName` ni `appId`: Windows guarda los datos en `%APPDATA%\<productName>` y el usuario perdería su historial.
- Carpetas del usuario: `settings.json`, `partidas/` (una grabación por partida, formato `v:1`), `historial/` y `ddragon/`.
- La versión 2.0 guardaba el historial en `cache/`, que en Windows es **la misma carpeta que `Cache/` de Chromium** (no distingue mayúsculas). `engine.js` lo copia a `historial/` sin borrar el original. No vuelvas a usar `cache/`.
- Los ajustes se guardan con merge (`saveSettings`): nunca reescribas el archivo entero desde cero.

## Trampas conocidas
- `npx asar extract-file <app.asar> package.json` **pisa el package.json del proyecto** si lo corrés en la raíz. Extraé en una carpeta temporal.
- Acá el sandbox no llega a Data Dragon: usá `--offline`. En la PC del usuario sí funciona.
- Xvfb a veces se cae: si Electron muere con SIGSEGV o "platform failed to initialize", levantalo de nuevo.
- Buscar el cliente con PowerShell es caro: `lcu.connect()` lo intenta como mucho cada 5 s.
- El HUD solo se ve si el juego está en modo **Sin bordes**. En pantalla completa exclusiva, Windows no deja dibujar encima.

## Pendiente / sin verificar con el juego real
- Formato exacto de los nombres en los eventos de kills de la Live API (se contemplan tres formatos).
- Que el `gameId` de `/lol-gameflow/v1/session` coincida con el del historial; si no, se une por campeón y hora.
- Posiciones por defecto del HUD con la interfaz de League a escala normal. El usuario las puede mover con Alt+Shift+E.
- Íconos reales: en las pruebas se usan placeholders.
- Bitty: no hay guías específicas para los campeones nuevos Locke y Zaahen, porque no se conocen sus kits.
- Idea pendiente: una foto extra al minuto 8 para junglas (primer recorrido y ganks).
