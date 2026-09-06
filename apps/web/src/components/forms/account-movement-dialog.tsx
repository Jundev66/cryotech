import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { treasuryApi, type Account } from '@/api/treasury.api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

interface Props {
  account: Account | null;
  onClose: () => void;
}

/**
 * Records a movement on an account that already exists.
 *
 * Until now the only way to put money into an account was to type an opening
 * balance while creating it. After that, nothing — so an account whose opening
 * balance was never entered could not be corrected from the app at all, and its
 * stored balance stayed adrift from its movements forever.
 *
 * Deliberately a movement and not an edit of the balance: the balance is the
 * sum of the ledger, and writing the number directly is what makes an account
 * permanently fail reconciliation.
 */
export function AccountMovementDialog({ account, onClose }: Props) {
  const queryClient = useQueryClient();
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState('');
  const [concept, setConcept] = useState('');
  const [reference, setReference] = useState('');
  const [movementDate, setMovementDate] = useState(new Date().toISOString().split('T')[0]);
  const [error, setError] = useState<string | null>(null);

  const recordMutation = useMutation({
    mutationFn: () =>
      treasuryApi.createMovement({
        accountId: account!.id,
        direction,
        amount: Number(amount),
        movementDate,
        concept: concept.trim() || undefined,
        reference: reference.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury'] });
      toast.success('Movimiento registrado');
      reset();
      onClose();
    },
    onError: (err) => setError(apiMessage(err, 'No se pudo registrar el movimiento')),
  });

  function reset() {
    setDirection('in');
    setAmount('');
    setConcept('');
    setReference('');
    setError(null);
  }

  const value = Number(amount);
  const canSubmit = Number.isFinite(value) && value > 0;

  return (
    <Dialog
      open={Boolean(account)}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent data-testid="movement-dialog">
        <DialogHeader>
          <DialogTitle>Registrar movimiento</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {account?.name} ({account?.currency})
        </p>

        <div className="space-y-4">
          <div>
            <Label>Tipo</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as 'in' | 'out')}>
              <SelectTrigger className="w-full" data-testid="movement-direction">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in">Entrada de dinero</SelectItem>
                <SelectItem value="out">Salida de dinero</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="movement-amount">Monto</Label>
            <Input
              id="movement-amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              data-testid="movement-amount"
            />
          </div>

          <div>
            <Label htmlFor="movement-concept">Concepto</Label>
            <Input
              id="movement-concept"
              placeholder="Ej: Saldo inicial"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              data-testid="movement-concept"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="movement-date">Fecha</Label>
              <Input
                id="movement-date"
                type="date"
                value={movementDate}
                onChange={(e) => setMovementDate(e.target.value)}
                data-testid="movement-date"
              />
            </div>
            <div>
              <Label htmlFor="movement-reference">Referencia (opcional)</Label>
              <Input
                id="movement-reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                data-testid="movement-reference"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive" data-testid="movement-error">
              {error}
            </p>
          )}

          <Button
            className="w-full"
            data-testid="submit-movement"
            disabled={!canSubmit || recordMutation.isPending}
            onClick={() => recordMutation.mutate()}
          >
            {recordMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registrar movimiento
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
