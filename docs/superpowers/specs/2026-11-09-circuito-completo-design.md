# Circuito completo: crudo → editor → marketing → pauta → memoria

Fecha: 2026-11-09 · Estado: diseño, falta que Gero lo apruebe

## Para qué

Hoy ACM publica reels que ya vienen editados y reparte la pauta a mano. La meta es cerrar el circuito entero sin editores humanos ni una persona moviendo plata: el equipo de cada dirigente sube crudos y el sistema edita, revisa, reparte entre cuentas, publica, pauta, mide, aprende y vuelve a empezar.

ACM es un sistema **general**: el primer cliente es la elección de Independiente, pero no tiene que quedar atado a la política. Lo que se optimiza se configura en cada proyecto. Para un candidato, lo que pesa es llegar a quien puede votarlo, o sea al público del padrón.

## Objetivos

1. **Servidor editor** aparte: entra un crudo y salen varias ediciones, distintas entre sí y ya revisadas.
2. **Agente de marketing** dentro de ACM: reparte las ediciones entre cuentas respetando las reglas anti-repetición, publica, decide qué promocionar, mueve plata entre reels y redes, corta lo que rinde poco y deja todo anotado en la memoria.
3. **Círculo cerrado**: lo que marketing aprende vuelve al editor para que edite mejor, sin que deje de probar cosas nuevas.

## Lo que no es (no-objetivos)

- No graba ni produce el crudo: eso lo hace el equipo del dirigente.
- No escribe guiones ni genera video desde cero.
- No hace bots de respuesta ni moderación de comentarios.
- No comparte lo aprendido entre dirigentes.

## Cosas que lo arruinarían aunque ande (anti-objetivos)

- Que dos cuentas de la misma red publiquen **la misma edición**.
- Que ediciones del mismo recorte salgan **casi al mismo tiempo**, porque se nota que es una red armada.
- Que se gaste más que la pauta total o que el tope diario, aunque sea por un rato.
- Que se publique algo que no pasó la revisión.
- Que se cierre en un solo estilo de edición o una sola red sin seguir probando.

## Volumen (para dimensionar)

| Dato | Valor |
|---|---|
| Dirigentes | 8 |
| Cuentas por dirigente | 7 por red × 4 redes (IG, FB, TikTok, YouTube) = 28 |
| Publicaciones por cuenta y día | 3 → 21 lugares por red y por dirigente |
| Crudos por día y dirigente | **7, fijo** |
| Largo de un crudo | **variable**: desde clips de 1 minuto hasta un podcast entero de una hora o más |
| Momentos interesantes por crudo | variable; se estiman 2 a 4 |
| Ediciones por momento | **3** |
| Ediciones por día y dirigente | ~42 a 84 (unas 63 en promedio) |
| Total por día | ~500 ediciones, 56 crudos, 672 publicaciones |

Una misma edición puede ir a **una cuenta de cada red** (es la regla que ya tiene ACM: "un reel en una sola cuenta por red"). Con 21 ediciones por día se llenan las 4 redes, así que casi siempre va a **sobrar** material: eso alimenta el banco.

## El circuito, paso a paso

```
Equipo sube crudo en ACM (R2, hasta 5 GB)
   │
   ▼
SERVIDOR EDITOR (servicio aparte)
   1. Transcribe (Whisper, CPU)
   2. Busca momentos interesantes en la transcripción (agente)
   3. Por cada momento: 3 ediciones distintas del MISMO recorte
   4. Analista (agente) revisa cada edición; lo dudoso va a "Para aprobar"
   5. Devuelve a ACM las ediciones aprobadas
   │
   ▼
ACM: banco de ediciones
   │
   ▼
AGENTE DE MARKETING (dentro de ACM)
   6. Reparto del día: elige ediciones, las asigna a cuentas y les pone hora
   7. Publica (el programador que ya existe)
   8. Cada 6 h: lee métricas, compara, promociona, mueve plata, corta
   9. Anota cada decisión y lo que aprendió en la memoria del dirigente
  10. Le pasa al editor qué estilos están ganando
```

### 1. Entrada del crudo

- El equipo sube el crudo desde ACM, en el celular o en la compu, con la subida directa a R2 que ya existe. El reel queda como `kind = 'crudo'`.
- Al terminar la subida, ACM le crea un **trabajo** al servidor editor con el proyecto, el crudo y un link firmado a R2.
- En la ficha del crudo se ve el estado: en cola → transcribiendo → buscando momentos → editando → revisando → listo, o error con el motivo.
- **Crudos largos** (podcast completo): el servidor los procesa por tramos y los momentos van apareciendo a medida que salen. *Decisión mía:* los crudos cortos se adelantan a los largos en la cola, para que un podcast no frene el material del día. Objetivos: un crudo corto listo en menos de 2 h y uno largo en menos de 12 h. Si la cola pasa las 24 h de atraso, se avisa por Telegram.
- *Decisión mía:* se editan como máximo 15 momentos por crudo. Si encuentra más, guarda el resto como momentos candidatos, que el agente de marketing puede mandar a editar cuando falte material.
- El editor baja el crudo con un link firmado que le pasa ACM y no tiene credenciales de R2. Los crudos se borran a los 7 días, con la limpieza que ya existe. *Decisión mía:* las ediciones se guardan hasta 7 días después de su última publicación, o hasta que vencen en el banco.

### 2. Momentos interesantes

- El agente del editor lee la transcripción con tiempos y marca cada **momento interesante**: un tramo donde la persona dice algo con sentido completo que vale la pena. Corta entre frases enteras, nunca en mitad de una palabra.
- La cantidad no es fija: puede ser 0 si el crudo no sirve, o 1, o muchos.
- Cada momento guarda inicio, fin, de qué habla (tema) y por qué se eligió. Eso va a la memoria.
- Para elegir, el agente usa la investigación del proyecto (`knowledge.js`) y lo que el dirigente ya sabe que funciona (paso 10).

### 3. Tres ediciones por momento

Las 3 ediciones salen del **mismo recorte**. Cambia la forma, no lo que se dice. Entre una edición y otra varía todo esto:

- **Gancho y arranque**: empieza en otro segundo o con otra frase o texto en pantalla.
- **Estilo de subtítulos**: tipografía, tamaño, colores, palabra por palabra o por frase. Van abajo y sin placa, como en los reels de Efaysto.
- **Música y ritmo**: otra música, cortes más rápidos o más lentos, zooms.
- **Largo y portada**: una más corta y otra más larga, con portada y texto de portada distintos.

Las especificaciones de salida son fijas: 9:16, 1080×1920 y una duración que entre en todas las redes. Facebook acepta reels de 3 a 90 s, así que el tope es **90 s**.

Cada edición guarda su **receta**: qué gancho, qué estilo de subtítulos, qué música, qué ritmo, cuánto dura y qué portada. Sin la receta no se puede comparar después.

La música sale de un **banco con licencia** (libre de derechos) que vive en el servidor editor, clasificado por clima.

Texto de publicación: cada edición trae su propio texto y sus hashtags, distintos entre las 3.

### 4. Analista (revisión dentro del editor)

- Un agente revisa cada edición mirando fotogramas, subtítulos (que coincidan con lo dicho y no tengan errores), audio (que no esté mudo ni saturado), que no haya cortes a mitad de palabra y que respete duración y formato.
- Puede aprobar, rechazar con motivo (el editor la rehace una vez y, si vuelve a fallar, la descarta) o mandar a **"Para aprobar"** lo que le genera duda.
- **Al principio todo pasa por Gero, de a recorte.** Una pantalla muestra las 3 ediciones de un mismo recorte juntas, y Gero las aprueba o rechaza ahí; si quiere, puede rechazar una sola de las tres. Lo que todavía no revisó espera en el banco y **no se publica**. Cuando un proyecto junta 19 recortes aprobados de los últimos 20, pasa a automático. Si después Gero rechaza alguno, vuelve a manual.
- Las opiniones de Gero (👍/👎 con comentario) van a la memoria con más peso, igual que en Efaysto.

### 5. Vuelta a ACM

El editor devuelve cada edición aprobada a ACM como un reel `kind = 'listo'`, con `source_id` = crudo y además: momento, receta, texto, hashtags, archivo en R2 y portada. Las ediciones del mismo momento comparten un **id de recorte**.

### 6. Reparto del día (agente de marketing)

Reglas duras: si alguna no se cumple, el servidor rechaza la publicación y no alcanza con que el agente "lo tenga en cuenta":

1. Una edición va a una sola cuenta por red (ya existe).
2. Ediciones distintas del mismo recorte pueden ir a cuentas distintas de la misma red, pero con **al menos 3 h** de diferencia entre una y otra. *Decisión mía:* la regla corre **dentro de cada red**. Entre redes distintas, la misma edición o una hermana puede salir a cualquier hora, porque son públicos distintos.
3. Se publica solo entre las **8 y las 23 h**, en la hora local del proyecto.
4. Nunca se pasa de los topes de cada red (IG 100/24 h, FB 30/24 h, TikTok ~15/día, YouTube según el cupo de la app) ni de la fecha máxima de propaganda. *Decisión mía:* el cupo de YouTube es de la app entera y se comparte entre todos los dirigentes. Se reparte en partes iguales entre los proyectos activos. Mientras no llegue la ampliación, YouTube publica menos que las otras redes y lo que no entra queda en el banco.
5. Solo se publican ediciones aprobadas.

Dentro de esas reglas, el agente:

- Llena los 3 lugares por cuenta y por día con lo mejor del banco.
- **Si sobra**, lo deja en el banco. Las ediciones de actualidad tienen fecha de vencimiento: el agente marca cuáles lo son y cuándo vencen (por defecto 3 días, *decisión del builder ajustable*).
- **Si falta**, saca del banco, y si no alcanza esa cuenta publica menos ese día. Nunca repite una edición. Si falta material dos días seguidos, avisa por Telegram.
- Elige el horario dentro de 8–23 h según lo que aprendió que rinde mejor para cada cuenta.
- El reparto se arma una vez por día y se rehace cuando entran ediciones nuevas.

### 7. Publicar

Se usa el programador que ya tiene ACM (cada 30 s, IG, FB Reels, YouTube Shorts, TikTok). Lo único nuevo es que las publicaciones las crea el agente en vez de una persona.

### 8. Análisis y pauta (cada 6 h)

**Datos que lee:** de cada publicación, sus métricas orgánicas (vistas, alcance, retención, interacción) y, si está promocionada, gasto, impresiones, alcance, CPM y alcance dentro del público del padrón.

**Objetivo:** un puntaje configurable por proyecto. Para un candidato, lo que más pesa es el **alcance dentro del público objetivo** (el padrón subido como público) por cada peso gastado, y después las impresiones y la retención. Los pesos van en Ajustes con valores por defecto, y el agente nunca los cambia.

**Cuándo promociona:** nunca apenas sale. Deja correr cada reel **orgánico** unas horas (por defecto 24 h; *el builder puede ajustar entre 12 y 24*) y promociona los que mejor arrancaron.

**Tipo de proyecto y redes con pauta.** Cada proyecto tiene un **tipo**, que se elige al crearlo, y un interruptor de pauta por red:

| Tipo | Pauta por defecto |
|---|---|
| Dirigente de club / fútbol | Meta, YouTube y TikTok, si la red lo permite |
| Propaganda política | Meta y YouTube, con la verificación de anuncios de elecciones de cada una. TikTok Ads **apagado** porque prohíbe la propaganda política: en TikTok se publica solo orgánico y la plata va a las otras redes. Queda pendiente analizar qué más se puede hacer. |
| Comercial / otro | las 3 |

Si una red rechaza anuncios o bloquea la cuenta publicitaria, el agente frena la pauta en esa red, pasa la plata a las otras y avisa por Telegram. No reintenta solo.

**Estructura:** **una campaña por red con pauta** y por dirigente: Meta (IG + FB), TikTok Ads y YouTube (Google Ads). El agente mete y saca reels de esas campañas. No crea campañas nuevas salvo que falte la de una red.

**Qué se promociona** (*decisión mía*): la **publicación orgánica que ya está en la cuenta**, no una creatividad nueva, para que conserve las vistas y los comentarios. En Meta se usa la publicación de IG o FB como anuncio, en TikTok un Spark Ad y en YouTube el Short como anuncio. Las métricas de pauta quedan atadas a esa publicación.

**Público objetivo por red** (*decisión mía*): se usa la misma lista del padrón, hasheada, en cada red que lo permite: Custom Audience en Meta, Customer Match en Google y Custom Audience en TikTok. Si una red no da el alcance dentro de esa lista, el puntaje de esa red usa el alcance en la segmentación del proyecto (zona y edad) con menos peso.

**Plata:**
- La **pauta total** y las fechas las pone Gero, como ya está en la pestaña Pauta.
- El **tope diario** sale de pauta restante ÷ días restantes. Lo que no se gasta un día puede pasar a los siguientes, pero nunca más del doble del tope en un día (*decisión mía, ajustable*).
- Al arrancar reparte **parejo entre las redes** y en cada revisión corre plata hacia la red que mejor rinde, dejando siempre un mínimo en cada una para seguir probando (por defecto 10 %).
- Dentro de cada red, sube la plata de los reels ganadores y baja la de los que rinden menos.
- Se mueve **solo, sin pedir ok**, siempre adentro de la pauta total y del tope diario. Si un cambio rompe un tope, lo rechaza el código y no el agente.

**Cuándo corta:**
- **Piso:** no se juzga un reel antes de gastar **USD 5 o pasar 48 h** promocionado, lo que llegue primero.
- Pasado el piso, el agente puede bajarlo si rinde por debajo del promedio del proyecto. También baja los que vienen cayendo y los que terminaron su campaña.
- Al llegar la fecha máxima de propaganda o al terminarse la pauta, se pausa todo.

### 9. Memoria y base de datos

La memoria es **de cada dirigente**, sin compartir nada. Todo lo que el agente decide o aprende queda guardado en el momento:

- **Diario de decisiones:** qué hizo, cuándo, con qué datos y por qué. Por ejemplo: "subí USD 3 al reel 812 porque su CPM en el padrón es la mitad del promedio".
- **Comparación entre hermanas:** cuando las 3 ediciones de un recorte ya juntaron datos, compara qué receta ganó, en qué red, cuenta y horario, y anota una hipótesis de **por qué** (por ejemplo: "el gancho con pregunta retuvo el doble que el que arranca con el nombre").
- **Aprendizajes:** reglas que se repiten y se confirman o descartan con el tiempo, como "en TikTok rinden más los de menos de 30 s" o "las 21 h es el mejor horario en IG". Cada uno tiene cuánta evidencia lo respalda.
- Las opiniones de Gero valen más que lo que el agente deduce solo.

Todo vive en la base de ACM, en tablas nuevas para métricas por publicación y por momento, decisiones, comparaciones y aprendizajes, y se puede ver en el panel.

### 10. Vuelta al editor

Cuando el editor arma las 3 ediciones de un momento, le pide a ACM los aprendizajes del dirigente y los usa así: **2 de las 3** siguen lo que viene ganando y **1** prueba algo distinto. Así el círculo se cierra sin quedar en un solo estilo.

## Avisos a Gero

- **Resumen diario por Telegram:** qué se publicó, cuánto se gastó y cuánto queda, qué ganó y por qué, y qué aprendió.
- **Alertas en el momento:** algo falló (publicación, edición o API), se intentó pasar un tope, falta material, una cuenta quedó desconectada o bloqueada, o el editor está atrasado.
- Además, todo se puede ver en el panel de ACM.

## Decisiones de cómo se arma (de Gero)

- El servidor editor es un **servicio aparte** con su propia API, en el servidor de Contabo (Cloud VPS 30: 8 núcleos y 24 GB, edición limitada a 6 núcleos, sin GPU). Lo usa ACM, y más adelante podría usarlo Efaysto.
- Los crudos se suben **en ACM**, directo a R2.
- La música sale de un banco con licencia.
- La pauta va en Meta, TikTok y YouTube.

## Lo que queda para el builder

- Lenguaje y forma del servidor editor (Node como ACM o lo que convenga), cola de trabajos y formato de la API entre ACM y el editor (con autenticación).
- Qué modelo usa cada agente. Referencia: Sonnet para elegir momentos y revisar, Haiku para textos, y en ACM el modelo que ya usa `agent.js`.
- Herramientas de edición: ffmpeg y cómo armar los estilos de subtítulos y portadas.
- Fórmulas concretas de la regla de corte, de "viene cayendo" y del reparto entre redes, respetando lo que dice este documento.
- Cómo se ven en el panel la memoria, las decisiones y la cola del editor.
- Un simulador para Meta Ads, TikTok Ads y Google Ads, como el que ya existe para publicar, y los casos del banco de pruebas (`npm run banco`) para cada regla dura.

## Límites conocidos

- YouTube: cupo de 100 subidas por día por app, con la ampliación a 300 pedida. TikTok: sin auditoría de la app solo publica en privado. Meta: permisos en revisión.
- Todo lo de pauta se prueba primero contra el simulador. Contra cuentas reales recién cuando estén las aprobaciones y Gero dé el ok.
