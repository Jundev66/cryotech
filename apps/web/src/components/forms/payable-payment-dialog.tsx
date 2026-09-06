import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { payablePaymentSchema, formatCurrency } from '@cryotech/shared-types';
import type { PayableKind, PayablePaymentInput } from '@cryotech/shared-types';
import { payablesApi } from '@/api/payables.api';
import { treasuryApi } from '@/api/treasury.api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

interface Props {
  kind: PayableKind;
  /** The purchase or processing being paid. */
  payableId: string | null;
  /** What it is, for the header — e.g. "ENT-2600012 · Alimento Engorde". */
  label: string;
  onClose: () => void;
}

/**
 * Records money paid against a purchase or a processing job.
 *
 * Paying moves cash and nothing else — the expense was recognised when the
 * goods arrived or the birds were slaughtered. Booking it again here is what
 * counted the Bs 2.450 to Carmen twice, so this never touches transactions.
 *
 * The account is required in practice even though the API allows it to be
 * omitted: a payment with no account updates the balance owed and leaves the
 * bank untouched, which is the exact mismatch the treasury page exists to catch.
 */
export function PayablePaymentDialog({ kind, payableId, label, onClose }: Props) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: payable } = useQuery({
    queryKey: ['payable', kind, payableId],
    queryFn: () => payablesApi.findOne(kind, payableId!),
    enabled: Boolean(payableId),
  });

  const { data: accounts } = useQuery({
    queryKey: ['treasury', 'accounts'],
    queryFn: () => treasuryApi.listAccounts(),
  });

  const form = useForm<PayablePaymentInput>({
    resolver: zodResolver(payablePaymentSchema),
    defaultValues: {
      amount: 0,
      currency: 'VES',
      paymentDate: new Date().toISOString().split('T')[0],
      notes: '',
    },
  });

  const payMutation = useMutation({
    mutationFn: (data: PayablePaymentInput) =>
      payablesApi.registerPayment(kind, payableId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['processing'] });
      queryClient.invalidateQueries({ queryKey: ['treasury'] });
      toast.success('Pago registrado');
      form.reset();
      setError(null);
      onClose();
    },
    onError: (err: unknown) => {
      // Surfaced in the dialog, not only as a toast: "excede el saldo pendiente"
      // is the answer to what you just typed, and it has to stay on screen.
      setError(apiMessage(err, 'No se pudo registrar el pago'));
    },
  });

  return (
    <Dialog open={Boolean(payableId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="payable-payment-dialog">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">{label}</p>

        {payable && (
          <div className="grid grid-cols-3 gap-2 rounded-md border p-3 text-sm">
            <div>
              <span className="text-muted-foreground">Total</span>
              <p className="font-medium">{formatCurrency(payable.total)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Abonado</span>
              <p className="font-medium">{formatCurrency(payable.paid)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Saldo</span>
              <p className="font-medium" data-testid="payable-balance">
                {formatCurrency(payable.balance)}
              </p>
            </div>
          </div>
        )}

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => payMutation.mutate(v))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monto (Bs)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" data-testid="payable-amount" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="accountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>¿De qué cuenta sale?</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full" data-testid="payable-account">
                        <SelectValue placeholder="Seleccionar cuenta" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {accounts?.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name} ({account.currency})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="paymentDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha del pago</FormLabel>
                  <FormControl>
                    <Input type="date" data-testid="payable-date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Referencia bancaria (opcional)</FormLabel>
                  <FormControl>
                    <Input data-testid="payable-reference" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {error && (
              <p className="text-sm text-destructive" data-testid="payable-error">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              data-testid="submit-payable-payment"
              disabled={payMutation.isPending}
            >
              {payMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Registrar pago
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
