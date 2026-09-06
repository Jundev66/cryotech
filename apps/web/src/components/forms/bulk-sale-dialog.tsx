import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  bulkSaleSchema,
  type BulkSaleInput,
  type Batch,
  SALE_TYPE_LABELS,
  formatCurrency,
  formatNumber,
} from '@cryotech/shared-types';
import { salesApi } from '@/api/sales.api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ClientCombobox } from '@/components/forms/client-combobox';
import { Loader2, Plus, Trash2, Users } from 'lucide-react';
import { apiMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/** The reference price of the business; each row can override it. */
const DEFAULT_PRICE_PER_KG = 4;

function emptyRow(saleType: 'live' | 'dead') {
  return {
    clientId: '',
    saleType,
    quantity: 0,
    weightKg: undefined,
    pricePerKg: DEFAULT_PRICE_PER_KG,
    totalAmount: 0,
    notes: '',
  };
}

interface BulkSaleDialogProps {
  batches: Batch[];
}

/**
 * Registers several sales of one batch, one per client, in a single pass.
 *
 * Each row carries its own numbers because that is what actually happens: a
 * batch is split between buyers and no two take the same weight. The batch and
 * the date sit on top because they belong to the run, not to a sale.
 *
 * The bird total is checked against what the batch has left **while typing**,
 * not on submit: it is the rule the server validates, and seeing it early
 * avoids filling six rows only to have them all rejected together.
 */
export function BulkSaleDialog({ batches }: BulkSaleDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saleType, setSaleType] = useState<'live' | 'dead'>('live');
  const [serverErrors, setServerErrors] = useState<string[]>([]);

  const form = useForm<BulkSaleInput>({
    resolver: zodResolver(bulkSaleSchema),
    defaultValues: { batchId: '', saleDate: '', items: [emptyRow('live')] },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });

  const items = form.watch('items') ?? [];
  const selectedBatch = batches.find((batch) => batch.id === form.watch('batchId'));

  // `Number` even though the type says `number`: inputs hand back text and `+`
  // concatenates instead of adding.
  const totalQuantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const grandTotal = items.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0);

  const available = selectedBatch?.currentQuantity ?? 0;
  const oversold = saleType === 'live' && selectedBatch != null && totalQuantity > available;

  const mutation = useMutation({
    mutationFn: (data: BulkSaleInput) => salesApi.createMany(data),
    onSuccess: (sales) => {
      // The batch and the processed stock moved, and so did the dashboard.
      for (const key of [['sales'], ['batches'], ['products'], ['dashboard']]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      toast.success(`${sales.length} ventas registradas`);
      reset();
      setOpen(false);
    },
    onError: (error) => {
      const message = apiMessage(error, 'Error al registrar las ventas');
      // The dialog does NOT close: losing an eight-row table to a validation
      // error would be worse than not having the screen.
      setServerErrors(message.split(' · '));
      toast.error(message);
    },
  });

  function reset() {
    form.reset({ batchId: '', saleDate: '', items: [emptyRow(saleType)] });
    setServerErrors([]);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  /** The sale type belongs to the run, so it is written into every row. */
  function applySaleType(next: 'live' | 'dead') {
    setSaleType(next);
    items.forEach((_, index) => form.setValue(`items.${index}.saleType`, next));
  }

  /** Weight × price, on blur. Editable afterwards: the total wins. */
  function recalcTotal(index: number) {
    const weight = Number(form.getValues(`items.${index}.weightKg`)) || 0;
    const price = Number(form.getValues(`items.${index}.pricePerKg`)) || 0;
    if (weight > 0 && price > 0) {
      form.setValue(`items.${index}.totalAmount`, Number((weight * price).toFixed(2)));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="new-bulk-sale">
          <Users className="mr-2 h-4 w-4" /> Varias Ventas
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Registrar varias ventas</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="batchId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lote</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full" data-testid="bulk-batch">
                          <SelectValue placeholder="Seleccionar lote" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {batches.map((batch) => (
                          // Code first: two batches of the same breed look
                          // identical, and shipping the wrong one is not
                          // noticed until the numbers stop adding up.
                          <SelectItem key={batch.id} value={batch.id}>
                            {batch.code ? `${batch.code} · ` : ''}
                            {batch.breed} ({formatNumber(batch.currentQuantity)} aves)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormItem>
                <FormLabel>Tipo de venta</FormLabel>
                <Select value={saleType} onValueChange={(value) => applySaleType(value as 'live' | 'dead')}>
                  <SelectTrigger className="w-full" data-testid="bulk-sale-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SALE_TYPE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>

              <FormField
                control={form.control}
                name="saleDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha (opcional)</FormLabel>
                    <FormControl>
                      <Input type="date" data-testid="bulk-sale-date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {serverErrors.length > 0 && (
              <div
                className="border-destructive/50 bg-destructive/5 text-destructive rounded-lg border p-3 text-sm"
                data-testid="bulk-errors"
              >
                <p className="font-medium">No se registró ninguna venta</p>
                <ul className="mt-1 list-inside list-disc">
                  {serverErrors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Cliente</TableHead>
                    <TableHead className="w-24">Cantidad</TableHead>
                    <TableHead className="w-28">Peso (kg)</TableHead>
                    <TableHead className="w-24">$ / kg</TableHead>
                    <TableHead className="w-28">Total</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {fields.map((row, index) => (
                    <TableRow key={row.id} data-testid="bulk-sale-row" data-row-index={index}>
                      <TableCell>
                        <FormField
                          control={form.control}
                          name={`items.${index}.clientId`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <ClientCombobox
                                  value={field.value}
                                  onChange={field.onChange}
                                  data-testid={`bulk-client-${index}`}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <FormField
                          control={form.control}
                          name={`items.${index}.quantity`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input type="number" data-testid={`bulk-quantity-${index}`} {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <FormField
                          control={form.control}
                          name={`items.${index}.weightKg`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.1"
                                  data-testid={`bulk-weight-${index}`}
                                  {...field}
                                  value={field.value ?? ''}
                                  onBlur={() => {
                                    field.onBlur();
                                    recalcTotal(index);
                                  }}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <FormField
                          control={form.control}
                          name={`items.${index}.pricePerKg`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  data-testid={`bulk-price-${index}`}
                                  {...field}
                                  value={field.value ?? ''}
                                  onBlur={() => {
                                    field.onBlur();
                                    recalcTotal(index);
                                  }}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <FormField
                          control={form.control}
                          name={`items.${index}.totalAmount`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input type="number" step="0.01" data-testid={`bulk-total-${index}`} {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          // A run with no rows is not an empty run, it is a
                          // broken form: one row always stays.
                          disabled={fields.length === 1}
                          onClick={() => remove(index)}
                          aria-label={`Quitar fila ${index + 1}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>

                <TableFooter>
                  <TableRow>
                    <TableCell className="font-medium">{fields.length} ventas</TableCell>
                    <TableCell
                      className={cn('font-medium', oversold && 'text-destructive')}
                      data-testid="bulk-total-quantity"
                    >
                      {formatNumber(totalQuantity)}
                    </TableCell>
                    <TableCell colSpan={2} className="text-muted-foreground text-xs">
                      {selectedBatch && saleType === 'live' && (
                        <span
                          className={cn(oversold && 'text-destructive font-medium')}
                          data-testid="bulk-remaining"
                        >
                          {oversold
                            ? `Faltan ${formatNumber(totalQuantity - available)} aves en el lote`
                            : `Quedan ${formatNumber(available - totalQuantity)} aves`}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-bold" data-testid="bulk-grand-total">
                      {formatCurrency(grandTotal)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append(emptyRow(saleType))}
                data-testid="bulk-add-row"
              >
                <Plus className="mr-1 h-4 w-4" /> Agregar cliente
              </Button>

              <Button
                type="submit"
                data-testid="submit-bulk-sales"
                disabled={mutation.isPending || oversold}
              >
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Registrar {fields.length} ventas
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
