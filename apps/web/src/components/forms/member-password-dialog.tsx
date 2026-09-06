import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { memberPasswordSchema, type MemberPasswordInput } from '@cryotech/shared-types';
import { membersApi } from '@/api/members.api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

interface Props {
  companyId: string;
  member: { id: string; name: string } | null;
  onClose: () => void;
}

/**
 * Sets a new password for a worker.
 *
 * This is the recovery path: no email is sent because there is nowhere to send
 * it, so whoever runs the company changes it and tells them. Saving it closes
 * that person's open sessions, and the screen says so — someone changing it
 * because a phone was lost needs to know it worked.
 */
export function MemberPasswordDialog({ companyId, member, onClose }: Props) {
  const [done, setDone] = useState(false);

  const form = useForm<MemberPasswordInput>({
    resolver: zodResolver(memberPasswordSchema),
    defaultValues: { password: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: MemberPasswordInput) =>
      membersApi.setPassword(companyId, member!.id, values),
    onSuccess: () => {
      setDone(true);
      toast.success('Contraseña cambiada. Sus sesiones abiertas se cerraron.');
      form.reset();
      onClose();
    },
    onError: (error) => toast.error(apiMessage(error, 'No se pudo cambiar la contraseña')),
  });

  return (
    <Dialog
      open={member !== null}
      onOpenChange={(open) => {
        if (!open) {
          form.reset();
          setDone(false);
          onClose();
        }
      }}
    >
      <DialogContent data-testid="member-password-dialog">
        <DialogHeader>
          <DialogTitle>Nueva contraseña</DialogTitle>
          <DialogDescription>
            Para {member?.name}. Se la tienes que decir tú — no se envía a ningún lado.
            Al guardarla se cerrarán sus sesiones abiertas.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contraseña</FormLabel>
                  <FormControl>
                    {/* `text` y no `password`: quien la escribe se la va a dictar
                        a otra persona, y taparla solo consigue que la dicte mal. */}
                    <Input type="text" autoComplete="off" data-testid="member-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={mutation.isPending || done}
              data-testid="submit-member-password"
            >
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cambiar contraseña
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
