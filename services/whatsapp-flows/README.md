# Formularios nativos de WhatsApp — apagados

Cinco formularios de una sola pantalla —venta, registro diario, beneficio,
planificación de lote y compra— con desplegables y un calendario de verdad.
Están **creados y con su diseño validado por Meta**, en estado `DRAFT`, y ahí se
quedan.

## Por qué no se usan

Publicarlos, y hasta mandarlos en borrador, devuelve:

```
(#139000) Blocked by Integrity — Integrity requirements not met.
```

Meta no libera formularios desde un negocio sin verificar, y esa verificación
pide documentos de una empresa registrada. *Granja Mata* es un emprendimiento
sin registro legal: no es un trámite pendiente, es una puerta cerrada.

| Requisito de Meta | Estado |
|---|---|
| Verificación del negocio *Angendly* | `not_verified` — no hay documentos que presentar |
| Número de WhatsApp | el de prueba, `+1 555-186-6385` (`verified_name: "Test Number"`) |

El resto del bot sí funciona en ese número: leer comprobantes, registrar cobros
y pagos, el menú y las consultas corren en vivo desde hace días.

## Qué se usa en su lugar

El **asistente por botones** (`apps/api/src/modules/assistant/wizard/`). Hace las
mismas preguntas de a una por mensaje y termina en los mismos registros —
`FlowSubmissionService` ejecuta las dos vías, así que una venta hecha por
WhatsApp cae idéntica a una hecha en la web.

Lo que se pierde: el calendario nativo, reemplazado por una lista de días que
se pagina hacia atrás hasta dos meses; y un mensaje por pregunta en vez de una
sola pantalla. Lo que no se pierde: todo lo que se puede tocar se sigue tocando.
Solo las cifras se escriben, y en el formulario también se escribían.

Sale gratis: cada mensaje del bot responde a uno tuyo, así que siempre cae
dentro de la ventana de 24 horas y nunca hace falta una plantilla.

## El diseño quedó atrás en un punto

`sale.json` sigue preguntando el lote antes que el tipo, con una lista de lotes
que tengan aves vivas. El asistente ya no: pregunta el tipo primero, porque una
venta de beneficiado sale del inventario de procesados y no del lote — con los
lotes en cero y 83 pollos en la nevera, el orden viejo cerraba la venta entera.

Una pantalla sola no expresa bien esa bifurcación, y el formulario está dormido,
así que se dejó como está. Si algún día se encienden, hay que rehacer esa
pantalla antes de usarla en serio.

## Si algún día hay un número registrado

El código ya elige solo. `AssistantService.openOperation` abre el formulario
cuando `FlowService.isAvailable()` dice que sí, y el asistente cuando no.

1. Registrar un número real en el WABA y verificarlo por SMS. Ojo: ese número
   deja de funcionar en la app normal de WhatsApp, así que tiene que ser una
   línea aparte.
2. `./publish.sh --publish` — si sigue diciendo *Blocked by Integrity*, el que
   manda es la verificación del negocio y no hay nada más que hacer.
3. Comprobar que un envío real llega al teléfono.
4. Recién entonces, en `apps/api/.env`: `WHATSAPP_FLOWS_ENABLED=true`.

Ese último paso es deliberado. Tener el id de un formulario no significa que
Meta lo entregue, y darlo por hecho ya hizo que el menú contestara "Nueva
venta" con un mensaje vacío y sin botones.

## Los archivos

| Archivo | Qué es |
|---|---|
| `flows/*.json` | El diseño de cada formulario (Flow JSON 7.3) |
| `flow-ids.json` | El id que Meta le dio a cada uno, para actualizarlos en vez de duplicarlos |
| `publish.sh` | Valida contra Meta y, con `--publish`, los libera |

```bash
./publish.sh                 # valida los cinco, no publica nada
./publish.sh --publish       # valida y publica
./publish.sh --only sale     # solo uno
```

Subir el asset es lo que valida: Meta responde con el componente y la propiedad
exactos que están mal. Sin `--publish` no se libera nada, así que la corrida por
defecto es inofensiva —y sigue valiendo la pena correrla al tocar un JSON, para
que el diseño no se pudra mientras espera.

`apps/api/scripts/check-flows.ts` verifica todo el camino de este lado del
cable —abrir el formulario, recibir la respuesta como la manda WhatsApp, crear
el registro, ignorar el reenvío— sin depender de Meta, y por eso sigue corriendo
aunque los formularios estén apagados.
