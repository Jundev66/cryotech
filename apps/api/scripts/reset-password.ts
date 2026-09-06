/**
 * Le pone una contraseña nueva a un usuario, desde la máquina donde corre la base.
 *
 * Esta es la recuperación del propietario. La del resto la hace él desde
 * Configuración → Usuarios, pero a sí mismo no puede: si pudiera, cualquiera
 * con `users.edit` le cambiaría la contraseña al dueño y se quedaría con la
 * empresa. Y no hay autoservicio por correo porque el proyecto no tiene por
 * dónde mandarlo.
 *
 * Un script y no un endpoint a propósito: quien puede correr esto ya tiene el
 * `DATABASE_URL` delante, o sea que ya podía hacerlo con `psql` y un hash. Lo
 * que aporta es hacerlo bien —bcrypt con el mismo coste, las mismas reglas, y
 * las sesiones revocadas— en vez de a mano y a medias.
 *
 *   pnpm --filter @cryotech/api reset-password alguien@correo.com
 *
 * La contraseña se pide por entrada estándar y no se hace eco, así que no queda
 * en el historial del shell ni en la lista de procesos.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline';

const prisma = new PrismaClient();

/** Las mismas que `strongPassword` en shared-types. Repetidas aquí para no
 *  arrastrar el paquete compilado a un script que tiene que correr suelto. */
const RULES: Array<[RegExp | ((s: string) => boolean), string]> = [
  [(s) => s.length >= 10, 'Mínimo 10 caracteres'],
  [(s) => s.length <= 128, 'Máximo 128 caracteres'],
  [/[a-z]/, 'Debe incluir al menos una minúscula'],
  [/[A-Z]/, 'Debe incluir al menos una mayúscula'],
  [/\d/, 'Debe incluir al menos un número'],
];

function problems(password: string): string[] {
  return RULES.filter(([rule]) =>
    typeof rule === 'function' ? !rule(password) : !rule.test(password),
  ).map(([, message]) => message);
}

/** Sin eco: la terminal no repite lo que se escribe. */
function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const output = (rl as unknown as { output: NodeJS.WriteStream }).output;
    let first = true;
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (chunk: string) => {
      if (first) {
        output.write(chunk);
        first = false;
      }
    };
    rl.question(prompt, (answer) => {
      output.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Uso: pnpm --filter @cryotech/api reset-password <correo>');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, fullName: true },
  });
  if (!user) {
    // Aquí sí se puede decir: quien corre esto tiene la base delante, así que
    // no hay nada que ocultarle. La discreción es para los desconocidos.
    console.error(`No hay ningún usuario con el correo ${email}.`);
    process.exit(1);
  }

  console.log(`\n  ${user.fullName ?? '(sin nombre)'}  ·  ${user.email}\n`);

  const password = await askHidden('  Contraseña nueva: ');
  const failed = problems(password);
  if (failed.length > 0) {
    console.error(`\n  No sirve: ${failed.join('. ')}.`);
    process.exit(1);
  }

  const again = await askHidden('  Otra vez: ');
  if (again !== password) {
    console.error('\n  No coinciden.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Las sesiones abiertas se cierran. Cambiar la contraseña y dejar vivos los
  // refresh tokens deja entrando durante siete días más exactamente al que uno
  // quería sacar.
  const [, revoked] = await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
  ]);

  console.log(
    `\n  Listo. ${revoked.count === 0 ? 'No había sesiones abiertas.' : `Se cerraron ${revoked.count} sesión(es).`}\n`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
