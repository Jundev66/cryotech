# Tests E2E

Manejan la web como la manejas tú: con el navegador, tocando botones y leyendo
lo que sale en pantalla. Nada de llamar a la API para *hacer* cosas — si un
botón dejó de funcionar, estos tests lo notan.

## Correrlos

```bash
make dev            # postgres + api + web
pnpm e2e            # 82 pruebas (67 `test()`, y navigation parametriza 16 rutas)
pnpm e2e:clean      # borra las empresas de prueba que se acumularon
```

También corren en CI: `.github/workflows/e2e.yml` levanta Postgres, migra,
arranca la API y ejecuta esto en cada PR. Antes se lanzaban a mano, así que no
bloqueaban nada.

Desde `apps/web` también sirven `pnpm e2e:ui` (modo interactivo) y
`pnpm e2e:report` (el reporte de la última corrida).

## Una empresa nueva por corrida, nunca *Granja Mata*

`global-setup.ts` registra un usuario, crea una empresa `E2E Granja <timestamp>`
y le siembra galpón, lote, cliente, tres productos, alimento en inventario y una
cuenta de tesorería con saldo. Los tests venden, cobran, compran, pagan y
benefician — hacer eso contra los libros reales los corrompería.

Todo se crea **por la API, no con INSERT**: crear una empresa no es una fila,
`CompaniesService.create` también siembra los roles, las unidades de medida y
las categorías de producto. Una empresa sin eso rompe media aplicación de formas
que parecen bugs de UI.

Después guarda las tres claves de `localStorage` que la app lee —access token,
refresh token y empresa activa— como `storageState`, así cada test arranca ya
dentro. `auth.spec.ts` es el único que empieza sin sesión, porque justamente
prueba el login.

Cada spec compra **su propio producto**. Si dos compraran el mismo, sus filas se
confundirían en la misma tabla y el test fallaría por dónde quedó cada una, no
por lo que probaba.

## Qué cubre

| Archivo | Qué comprueba |
|---|---|
| `auth.spec.ts` | Entrar de verdad; contraseña equivocada no entra y **lo dice**; sin sesión va a login |
| `batches.spec.ts` | Planificar con insumos → confirmar: el stock sube **una vez** y se reconoce **un** gasto; pasar a venta no cobra nada |
| `entries.spec.ts` | Registrar → recibir (sube stock, nace el gasto) → pagar (baja la caja y **no** nace un segundo gasto); rechaza pagar de más |
| `processing.spec.ts` | Beneficiar saca aves del lote y deja el costo en **bolívares**; pagarlo no reconoce otro gasto |
| `sales.spec.ts` | Vender fiado, cobrar una parte, ver bajar el saldo **y que el dinero llegue a la cuenta** |
| `treasury.spec.ts` | La apertura entra como movimiento, no como saldo suelto; la reconciliación no encuentra diferencias |
| `daily-log.spec.ts` | La mortalidad descuenta aves del lote; un segundo registro del mismo día se rechaza |
| `feed.spec.ts` | Fórmula; el consumo baja el inventario **al aprobarlo**, no al registrarlo; no deja consumir más de lo que hay |
| `catalog.spec.ts` | Clientes, productos y galpones: crear, editar, y que **aparezcan donde se usan** |
| `settings.spec.ts` | Unidades, categorías y roles: crear uno y poder elegirlo en un producto |
| `reports.spec.ts` | Los números en pantalla concuerdan con los libros; "Sin datos" solo cuando de verdad no hay |
| `navigation.spec.ts` | Las 16 pantallas cargan sin respuestas 4xx/5xx ni estados de error |
| `security.spec.ts` | 14 pruebas contra la API sin navegador: aislamiento entre empresas, validación de entrada, rate limiting y cabeceras |
| `bulk-sales.spec.ts` | Varias ventas de un lote en una tanda; el lote no se sobregira aunque cada fila quepa por separado |
| `processed-sale.spec.ts` | Vender beneficiado con el lote en cero: sale de la nevera, no del corral |
| `company-switch.spec.ts` | Al cambiar de empresa no queda en caché ni un dato de la anterior |
| `password-reset.spec.ts` | El dueño le cambia la contraseña a un trabajador; la vieja deja de servir |
| `search.spec.ts` | La búsqueda encuentra por nombre, código y con acentos |

## Cómo están escritos

**Actuar por la pantalla, verificar por los libros.** Todo lo que el usuario
hace pasa por el navegador. Para comprobar el resultado se lee la API con
`readApi()` — porque "se reconoció un gasto, no dos" contra una tabla que
pagina y redondea es cómo un test da verde con la contabilidad rota.

**`data-testid` para lo que se toca, texto visible para lo que se verifica.**
Así un cambio de copy que rompe al usuario rompe el test, y un cambio de
maquetado que no cambia nada, no.

**Esperar a que algo desaparezca, no a que aparezca.** Varios textos ("En
Crianza", "Confirmado") ya están en el botón o en las pestañas del filtro, así
que esperarlos da verde antes de que el servidor haga nada. Se espera a que el
botón que se tocó deje de existir.

Los `Select` son listbox de Radix, no `<select>` nativos: `selectOption` no hace
nada con ellos. Para eso está `chooseOption()` en `fixtures.ts`.

Las empresas de prueba se acumulan a propósito. Los datos de la última corrida
son lo que se lee cuando algo falló, y borrarlos como efecto secundario de la
siguiente corrida quitaría justo eso. `pnpm e2e:clean` las borra cuando estorban.

## Lo de WhatsApp no está aquí

Playwright maneja un navegador, y WhatsApp no tiene uno: es una API de mensajes.
El bot se prueba en `apps/api/scripts/check-wizard.ts`, que lo maneja con las
mismas formas de mensaje que manda WhatsApp —toques, texto, paginación— y
comprueba cada registro contra la base. `check-inbound-e2e.sh` cierra el camino
completo: empuja un webhook firmado al Worker en Cloudflare y comprueba que la
API lo drene y conteste.
