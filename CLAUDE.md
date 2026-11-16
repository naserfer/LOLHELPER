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
| `bitty` | Bitty (amigo), Master | jungla, mid | Nocturne y Diana (jungla), Diana (mid) | op.gg Master+ + Lolalytics (Master+ y Emerald+) | `PickHelper-Bitty.exe` · `%APPDATA%\Pick Helper Bitty` |

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
src/keywatch.js         Lee si Tab está apretada (PowerShell + GetAsyncKeyState), sin quedarse con la tecla
src/player.js           Quién usa la app (Naser o Bitty): se elige la primera vez; cada uno con su carpeta de datos
src/engine/
  engine.js             Orquesta todo: perfil, cliente, partida, historial, grabador, coach
  lcu.js                Credenciales del cliente (PowerShell o lockfile; LOL_PATH lo pisa) y HTTPS a 127.0.0.1
  ddragon.js            Data Dragon (campeones, ítems, runas) con caché; íconos de ítems desde el cliente
  itemdb.js             Recetas y "qué comprar con X de oro" (planPurchase)
  select.js             Champ select: analyzeLane (top/jungla/mid) y analyzeSupport (+ sinergia ADC)
  botlane.js            Plan de bot lane para support: estilo de línea, combo, amenaza y post-6 (ver "Plan de bot")
  jgplan.js             Bitty: mezcla op.gg + Lolalytics y plan de jungla/mid (ver "Bitty")
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
  items.json            Lista fija de ítems vigentes (ver "Lista de ítems"); se actualiza a mano
  bot_lane.json         Plan de bot: perfiles de ADC, aportes de cada support, combos y support vs ADC (Lolalytics)
  bitty_lolalytics.json Bitty: matchups de Lolalytics (mismo rol, por tier) y su campeón contra cada línea rival
  starts.json           Mascota de jungla por campeón (op.gg Master+, % de partidas que la eligen)
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

## Un solo .exe: elegir jugador
- La primera vez, `main.js` muestra `renderer/choose.html` ("¿Quién sos?") y guarda `%APPDATA%\Pick Helper\jugador.json`.
- Cada jugador usa su carpeta de siempre: Naser `%APPDATA%\Pick Helper`, Bitty `%APPDATA%\Pick Helper Bitty` (se le pasa como `userDir` al motor). Así no se toca `productName` ni `appId`.
- Orden: `PH_PROFILE` > lo elegido > el perfil con el que se armó el .exe si no es naser (un `PickHelper-Bitty.exe` viejo sigue siendo de Bitty) > preguntar.
- En Ajustes: "Cambiar a …" guarda y reinicia. El .exe portable corre desde una copia temporal que se borra al cerrar, por eso se relanza `PORTABLE_EXECUTABLE_FILE`.
- En pruebas (`--demo`, `--userdir`, `--selftest`, `--hudtest`) no se pregunta. `--choose --appdata=DIR --choosetest=out.json --choosepick=bitty` prueba la ventana; `--appdata=DIR` solo simula `%APPDATA%`.

## Perfiles y roles
- La posición asignada en champ select (`top|jungle|middle|bottom|utility`) elige el pool, si el perfil tiene ese rol. Si no, usa `rol_por_defecto` de los ajustes.
- `kind: "support"` usa `analyzeSupport` (con ADC aliado y sinergia). `kind: "lane"` usa `analyzeLane`.
- En partida, el rol sale de `position` de la Live API (`JUNGLE`→`jungle`, `MIDDLE`→`mid`…). `BUILD_RULES` acepta claves `Campeón|rol`, por ejemplo `Diana|jungle` y `Diana|mid`, porque arman distinto.
- `track_adc: false` (Bitty) desactiva la causa de muerte "tu ADC ya había caído".
- Para correr otro perfil en desarrollo: `PH_PROFILE=bitty npm start`.

## Mover el overlay
- **Alt+Shift+E:** modo acomodar. El HUD toma el mouse y el foco hasta que lo terminás.
- **Mantener Tab y arrastrar** (pedido del usuario): sin salir del juego. Detalles que importan:
  - Tab **no** se registra con `globalShortcut`: eso se queda con la tecla y el marcador del juego dejaría de abrir. `src/keywatch.js` levanta un PowerShell que consulta `GetAsyncKeyState(VK_TAB)` cada 40 ms e imprime `1`/`0` al cambiar. Solo lee el estado del teclado de Windows: no lee el juego ni manda teclas.
  - Con Tab apretado: `setIgnoreMouseEvents(true, {forward: true})`. El renderer ve el mouse y avisa (`hud-grab-capture`) para atrapar los clics **solo encima de un recuadro**; en el resto los clics siguen yendo al juego. La ventana nunca se vuelve enfocable.
  - Los recuadros vacíos (por ejemplo el aviso de muerte) aparecen como fantasma para poder moverlos.
  - Al soltar Tab, el recuadro queda donde estaba y se guarda en `hud_layout`.
  - Se apaga con `hud_tab_drag: false` en `settings.json`. En `--demo` no se lanza el PowerShell; `--hudgrab` simula Tab apretado en `--hudtest`.

## Plan de bot (support)
- `botlane.plan()` suma: support vs support (op.gg), **support vs ADC rival (Lolalytics, Δ2)**, sinergia con tu ADC (op.gg o estimada por tipo), perfil de los dos ADCs (`fuerte|medio|debil`, ANÁLISIS) y tu historial con la dupla.
  - Los números de op.gg/Lolalytics pesan entero desde 1000 partidas. Tu historial se muestra siempre, pero pesa solo con 5+ partidas, encogido hacia 50% (5/5) y como mucho ±0,5.
  - Estilo: `allin | poke | hold | protect` según el puntaje y tu tipo de support. Si no hay rivales elegidos: plan general, sin amenazas.
- Combo: solo interacciones de kit verificadas en la wiki (Braum + ADC de autos, Jhin W con tu daño, plasma de Kai'Sa, R de Kalista, trampa de Caitlyn con control de más de 1 s…). Si no hay, no se muestra. Todo es `ANÁLISIS`; **no hay material PRO de support**. Si alguna vez se agrega, va con `pro: { fuente }`.
- En partida (`botPlanLive` + `forGame`): sin números. El overlay muestra una línea hasta 1:30 y otra 20 s al llegar al 6 (`win_until`).
- Para actualizar: bajar de Lolalytics `.../counters/?lane=support&vslane=bottom&tier=emerald_plus` (se lee desde un navegador: carga con JS), pegar en `tools/datos/support/raw_vs_adc.txt` y correr `node tools/datos/support/build_bot_lane.js`.

## Bitty: dos fuentes y plan de jungla/mid
- **Por qué:** op.gg Master+ da ~110 partidas de mediana por matchup. `jgplan.mix()` (se aplica al cargar los pools) mezcla el WR de op.gg Master+ con Lolalytics Master+ (mismo peso) y Lolalytics Emerald+ (mitad de peso, otro nivel), ponderado por partidas. `score` usa la mezcla; quedan `score_opgg`, `wr_mix`, `games_mix` y `sources` para mostrar. Si Lolalytics no tiene el cruce, todo queda igual. El top de Naser no se toca.
- **Plan de jungla** (`jgplan.plan`): con qué línea jugar según su jungla contra el que juega cada línea (Lolalytics Emerald+, Δ2, 300+ partidas y |Δ2| ≥ 1), dónde no gastar ganks, cómo le va contra el jungla rival y qué cambia en el 6 (guía).
  - El WR es de **toda la partida**: la frase de datos no da órdenes de early ("invadí"); eso lo dice la guía del kit, que puede decir lo contrario (Lee Sin gana el 2-3 aunque la partida larga favorezca a Nocturne).
- **Diana mid:** cuánto respetar al jungla rival (Lolalytics Diana mid vs jungla).
- En partida (`jgPlanLive` + `forGame`): sin números ni la palabra "partidas"; overlay hasta 1:30 y 20 s al llegar al 6, igual que el de support.
- **Locke y Zaahen:** guías con los kits leídos en la wiki (16.22), en `tools/datos/bitty/knowledge.py`.
- **Foto del minuto 8** (`recorder.snap8`: `cs8`, `lvl8`, `kp8`, `d8`): se graba siempre, pero `wincons.earlySpec` la usa solo en jungla y solo si **todas** las partidas del rol la tienen (las viejas no la traen; rellenarlas con 0 inventaría reglas).
- Para actualizar: Lolalytics `.../counters/?lane=jungle&vslane=<jungle|top|middle|bottom>&tier=<master_plus|emerald_plus>` (y `lane=middle` para Diana mid) → `tools/datos/bitty/raw_lolalytics.txt` → `node tools/datos/bitty/build_lolalytics.js`.

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

## Lista de ítems (data/items.json)
- La app **solo recomienda comprar** ítems que estén en `data/items.json` y que Data Dragon marque como comprables en la Grieta (`ItemDB.buyable`). Precios y recetas siguen saliendo de Data Dragon.
- Motivo: Riot deja ítems sacados dentro de `item.json` con `purchasable: false` (ej. Chemtech Putrifier en 16.22.1) y `idOf` los aceptaba igual.
- `transforma`: ítems que no se compran sino que se transforman (Diadem of Songs ← Whispering Circlet, Muramana ← Manamune…). Si una build los pide, se recomienda el ítem base (`ItemDB.toBuy`).
- El usuario la quiere **actualizar a mano**, no que se baje sola en cada partida. Al cambiar de parche: borrar los ítems que salieron, sumar los nuevos (`"id": "Nombre en inglés"`), cambiar `patch` y correr `node test/items_list.js`, que avisa si algún ítem que usa el código o los `pool*.json` ya no está en la lista.
- Sin lista (`ItemDB` creado a mano en pruebas) se comporta como antes, para que la prueba de equivalencia con Python no cambie.

Op.gg muestra el parche como `16.22`; el jugador lo llama `26.22`. Es el mismo parche.

## Algoritmos clave
- **Inicio de partida (`ingame.analyzeGame`):** hasta 1:30 y mientras todo lo que tenés sea parte del inicio, recomienda lo que falta del `start` de tu pool (mascota, ítem de support, Doran's, pociones), contando las pociones del inventario (`count`). Así, con el ítem de support comprado, pide las 2 pociones. La mascota explica por qué con `data/starts.json`.
- **Compra (`itemdb.planPurchase`):** calcula el costo restante descontando los componentes que ya tenés. Si no te alcanza para el ítem completo, busca la mejor combinación de componentes que sí podés pagar. Si sobra oro, encadena el siguiente ítem y suma una Control Ward si te alcanza.
- **Reglas (`wincons.learn`):** para cada número busca el mejor corte con al menos 7 partidas por lado. Las winrates se encogen hacia 50% (prior 5/5). Una regla vale solo si supera el 95% del máximo que sale con resultados mezclados al azar (300 permutaciones, con todos los números a la vez). Las que no llegan pero tienen p ≤ 0,3 se muestran como `PISTA`.
  - Reglas **tempranas** (`EARLY`, foto del 14): se aprenden por rol. Las partidas antiguas (65%) entrenan; las posteriores (35%) validan. Hacen falta 20 partidas de entrenamiento y al menos 5 victorias y 5 derrotas posteriores (31 partidas completas por rol como mínimo). Solo se activan reglas con al menos 5 partidas a cada lado del corte, diferencia favorable en validación y `p ≤ 0,05` tras permutar resultados entre todas las candidatas.
  - Reglas de **partida completa** (`FULL`): también se separan y validan por rol con el mismo criterio. Se muestran como "menos confiables", porque sus números pueden ser consecuencia de ir ganando.
  - Las grabaciones nuevas guardan `role`. Para grabaciones viejas sin rol se infiere solo si el campeón pertenece a un único pool del perfil; las ambiguas no entrenan el coach.
- **Autopsia de coach** (`autopsy.js`): pensada como la haría un coach, no como una lista de errores.
  - **Veredicto** de cada muerte: `error` (evitable), `cambio` (tu equipo mató a alguien en la pelea, ±10 s), `sacrificio` (tu equipo tomó dragón/heraldo/barón/Atakhan: una torre sola no alcanza) o `neutral`.
  - **Causas** por prioridad: `torre`, `sin_vida` (18+ s con ≤35% de vida antes de morir), `reventado` (≥70% de vida 2-4 s antes), `equipo` (2+ aliados ya muertos), `jungla` (no aplica si sos el jungla), `superado` (3+), `adc` (≤12 s antes), `items` (el que te mató tenía 1500+ de oro más en ítems), `nivel` (+2; de support solo cuenta contra el ADC/support rival), `oro` (≥1000), `objetivo`. Si nada aplica: `clara`.
  - **Costo:** tiempo muerto (`respawnTimer`) y lo que tomó el rival mientras tanto (torres, inhibidores, dragón, heraldo, barón, Atakhan) en puntos; `cara` desde 3.
  - **Resumen** (`summarize`): un solo **foco** (la causa con más peso `1 + costo` en las últimas 10 partidas, no la más frecuente), **progreso** (muertes evitables por partida, últimas 5 contra las 5 anteriores, desde 10 partidas), **qué te hace perder** (causas con 0,5+ por partida más en derrotas que en victorias, con 4+ de cada una) y **lo que hiciste bien**. `reviewGame` arma la revisión de la última partida con la muerte más cara.
  - **Datos:** el grabador guarda la vida (`activePlayer.championStats`, API oficial) de los 25 s anteriores, aliados muertos, oro en ítems tuyo y de cada atacante, rol, tiempo muerto y un log de kills y objetivos por equipo (`rec.ev`; las torres por el nombre `Turret_T1/T2_…`). Las grabaciones viejas no tienen esto: se clasifican igual que antes.
  - Los nombres de los eventos se comparan con `riotId`, `riotIdGameName` y `summonerName`, con o sin `#TAG`.
- **Eventos:** se deduplican por contenido (`nombre|tiempo|víctima|asesino`), no solo por `EventID`.

## Pruebas
`DISPLAY=:9 npm test`, con Xvfb levantado: `Xvfb :9 -screen 0 2560x1440x24 &`. Corre:
- `test/golden/compare.js`: la versión JS da exactamente lo mismo que la Python (395 casos). Usa `items_golden.json` congelado; **no lo modifiques**. Para agregar ítems de prueba usá `test/items_test.json`.
- `test/items_list.js`: la lista de ítems es coherente y no se recomienda nada que ya no se compre.
- `test/keywatch.js`: lectura de Tab (sin mandar teclas ni leer memoria) y que se suelte si PowerShell se cae.
- `test/botlane.js`: plan de bot (fuentes, fallbacks, combos solo con kit, historial con muestra chica, sin números en partida).
- `test/player.js`: elegir jugador la primera vez y que cada uno use su carpeta.
- `test/bitty_plus.js`: mezcla de fuentes, plan de jungla/mid, guías de Locke y Zaahen y foto del minuto 8.
- `test/start_items.js`: inicio de partida (support con el ítem ya comprado → 2 pociones, mascota de jungla con su dato, Doran's + pociones en mid).
- `test/coach.js`: autopsia de coach (vida, cambios, sacrificios, costo, nivel por rol, foco por costo, progreso, compatibilidad con grabaciones viejas).
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
- Posiciones por defecto del HUD con la interfaz de League a escala normal. El usuario las puede mover con Alt+Shift+E o con Tab + arrastrar.
- Arrastre con Tab probado solo con eventos simulados en Xvfb: falta confirmar en Windows con el juego en Sin bordes que `forward: true` deja pasar los clics fuera de los recuadros.
- Íconos reales: en las pruebas se usan placeholders.
- Que `scores.creepScore` de la Live API cuente los campamentos de jungla (el marcador del juego los cuenta).
- Autopsia: confirmar con partidas reales los nombres de `TurretKilled`/`InhibKilled` (`Turret_T1_…`) y que `respawnTimer` venga cargado en el momento de la muerte.
- Stream: el overlay sale con "Captura de pantalla" pero no con "Captura de juego" de OBS. Idea: servirlo como fuente de navegador (o esconderlo de las capturas con `setContentProtection`).
