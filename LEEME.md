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

## Mover el overlay
En partida, **mantené Tab y arrastrá** cualquier recuadro (la compra, el plan del 14 o el aviso de muerte) con el mouse. Mientras tengas Tab apretado, los recuadros que no se están mostrando aparecen como un recuadro punteado para que también los puedas mover. Al soltar, quedan donde los dejaste. El marcador del juego sigue abriendo normal. También está **Alt+Shift+E** para acomodar todo con calma y **Alt+Shift+R** para volver a las posiciones de fábrica.

## Plan de bot (support)
En champ select, con tu support elegido, aparece **Plan de bot con tu ADC**:
- **Cómo jugar la línea:** all-in, poke, aguantar o proteger, según tu support y tu ADC contra los dos rivales.
- **Por qué:** cada número dice de dónde sale: op.gg (vs support y sinergia), Lolalytics (vs el ADC rival) y tu historial. Si jugaste menos de 5 partidas con esa dupla, tu récord se muestra pero no cambia el plan.
- **Combo con tu ADC, qué respetar y qué cambia en el 6:** salen de los kits (`ANÁLISIS`). No hay guías de profesionales de support, así que nada se marca `PRO`.

En partida ves el mismo plan sin números. En el overlay aparece una línea corta al empezar (hasta 1:30) y otra al llegar al 6.

## Quién sos
La primera vez que abrís la app te pregunta si sos **Naser** (support), **Bitty** (jungla y mid) o **Mauri** (jungla, Udyr). Cada uno tiene sus propios datos. Para cambiar, andá a Ajustes → "Cambiar a …".

## Arranca con Windows y queda en la bandeja
- Al prender la PC, la app se abre sola, **escondida**, con su ícono abajo a la derecha (al lado del reloj; si no lo ves, tocá la flechita ^).
- Clic en el ícono: abre la app. Clic derecho: **Abrir**, **Iniciar con Windows** (prender/apagar) y **Salir**.
- La **X** la esconde en la bandeja: el overlay, los clips y el coach siguen andando. Para cerrarla del todo: clic derecho en el ícono → Salir.
- Si está escondida y empieza un champ select, aparece sola (sin sacarte el foco).
- Todo se puede apagar en Ajustes → Windows.
- Si movés el `.exe` a otra carpeta, abrilo una vez desde ahí para que Windows lo arranque desde el lugar nuevo.

## Mauri (Udyr jungla)
- **¿AD o AP?** En champ select y en partida la app te dice qué armar y **por qué**:
  - **AD (subís Q):** daño físico por % de vida y velocidad de ataque. Duelos, objetivos rápidos y llegar a sus carries con E.
  - **AP (subís R):** tormenta mágica alrededor tuyo que les pega a todos y los ralentiza, más escudo de W y Liandry's. Peleas de equipo y más aguante.
  - **Cómo decide:** primero el daño de tu equipo (si todos pegan físico → AP; si ya tienen mucho AP → AD), después los rivales (casi sin tanques → AD; mucho cuerpo a cuerpo encima tuyo → AP). Sin una razón clara, AD (la más jugada). Las dos rinden parecido en los datos (op.gg Emerald+): no hay una que gane siempre.
  - **En partida:** si ya compraste algo de un camino (por ejemplo Long Sword o Haunting Guise), te dice que sigas ese: cambiar a mitad te deja con ítems que no sirven. En el overlay ves "Armá AP (subí R)…" al empezar.
- **Datos:** op.gg Emerald+ y Lolalytics (Emerald+ y Master+). Si Mauri juega en otro rango, se puede cambiar.
- **Plan de jungla y guías:** con qué línea jugar, qué respetar de cada jungla y cómo gankear con E. Udyr no tiene definitiva, así que no hay avisos de "al 6".

## Festejo de triple, cuádruple y penta
Si en la partida hiciste un triple o más, al terminar la app aparece sola y festeja: animación grande con tu campeón, una frase y fuegos artificiales (con sonido bajito). Si se grabó el clip, tenés el botón **▶ Ver la jugada**. Se cierra con **Seguir** o sola a los 14 segundos.

## Bitty (jungla y mid)
- **Más datos:** cada matchup mezcla op.gg Master+ con Lolalytics (Master+ y Emerald+, este último a mitad de peso). Antes había ~110 partidas por matchup; ahora suelen ser miles. Debajo de cada campeón ves el número de cada fuente.
- **Plan de jungla:** con qué línea jugar (dónde rinde mejor tu jungla contra cada rival), dónde no gastar ganks, cómo te va contra el jungla rival y qué cambia en el 6. En partida aparece sin números, y en el overlay al empezar y al llegar al 6.
- **Diana mid:** cuánto respetar al jungla rival.
- **Locke y Zaahen:** guías armadas con sus kits reales.
- **Coach de jungla:** además del minuto 14 graba el **minuto 8** (campamentos, nivel, participación y muertes). Lo usa cuando todas tus partidas de jungla grabadas lo tengan.
- **Avisos de jungla en partida:** si el jungla rival aparece en una línea, te dice que juegues del otro lado del mapa; las diferencias de nivel y el "está muerto" hablan de campamentos e invasiones, no de torres ni oleadas.

## Coach de muertes
Cada muerte se revisa como lo haría un coach:
- **Evitable, cambio u objetivo:** si te llevaste a alguien o tu equipo tomó un dragón o barón, no es un error y no se cuenta como tal.
- **Causas nuevas:** "Te reventaron de golpe" (de casi toda la vida a 0 en segundos), "Te quedaste con poca vida" (más de 18 s con menos de 35% sin volver), "Pelea ya perdida" (con 2 aliados muertos) y "Rival con más ítems". De support, estar abajo de nivel contra un mid o top ya no cuenta como error.
- **Lo que te costó:** cuánto estuviste muerto y qué tomó el rival mientras tanto. En tu última partida se marca la muerte más cara.
- **Tu foco para la próxima:** una sola cosa, la que más te costó en tus últimas 10 partidas.
- **Tu progreso, qué te hace perder y lo que hiciste bien:** aparecen cuando hay suficientes partidas para decirlo.

Las partidas grabadas antes de esta versión se siguen analizando como antes. Las nuevas traen todo.

## Compra del inicio
Al empezar la partida, la app te dice qué comprar del inicio y cuenta lo que ya tenés:
- **Support:** ítem de support + 2 pociones. Si ya compraste el ítem, te pide las 2 pociones.
- **Jungla:** la mascota (**Scorchclaw Pup** para Nocturne y Diana, la que elige el 87% y el 59% en Master+ según op.gg) + poción.
- **Mid y top:** el Doran's que corresponde + pociones.

Después de 1:30 deja de insistir, porque ya estás en línea o en tu primer campamento.

## Clips de tus muertes y tus jugadas
- En **Tu última partida**, cada muerte tiene **"▶ Ver la muerte"**: el clip de los 25 segundos anteriores y los 5 posteriores.
- Las **triples, cuádruples y pentas** se guardan en **"Tus jugadas"**, con una felicitación encima del video.
- No se graba la partida entera: el video está en memoria y al disco solo van los clips. Los de muertes se borran solos cuando empieza la partida siguiente; las jugadas se guardan (las últimas 30).
- Usa la placa de video. Si tu placa no puede codificar, los clips se apagan solos para no bajarte FPS. Se apagan en Ajustes → Clips.
- Jugá en modo **Sin bordes** (igual que para el overlay).
