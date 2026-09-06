import { useState } from 'react';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  treasuryApi,
  type Account,
  type AccountPayload,
  type IdentifierKind,
} from '@/api/treasury.api';
import { ACCOUNT_KIND_LABELS, MOVEMENT_DIRECTION_LABELS, MOVEMENT_SOURCE_LABELS } from '@cryotech/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Loader2, Pencil, Trash2, ArrowRightLeft, Coins, ScaleIcon, CirclePlus } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { useListSearch } from '@/hooks/use-list-search';
import { AccountMovementDialog } from '@/components/forms/account-movement-dialog';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

const money = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const IDENTIFIER_LABELS: Record<IdentifierKind, string> = {
  last4: 'Ultimos 4 digitos',
  phone: 'Telefono (pago movil)',
  document: 'Cedula / RIF',
};

interface IdentifierDraft {
  kind: IdentifierKind;
  value: string;
  bankCode: string;
}

const emptyAccount: AccountPayload & { openingBalance: string } = {
  name: '',
  kind: 'bank',
  currency: 'VES',
  isActive: true,
  identifiers: [],
  openingBalance: '',
};

export default function TreasuryPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState({ ...emptyAccount });
  const [identifiers, setIdentifiers] = useState<IdentifierDraft[]>([]);
  const [movementAccount, setMovementAccount] = useState<Account | null>(null);

  const { value: searchValue, setValue: setSearchValue, search } = useListSearch();

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['treasury', 'accounts'],
    queryFn: () => treasuryApi.listAccounts(true),
  });

  const { data: movements } = useQuery({
    queryKey: ['treasury', 'movements', { search }],
    queryFn: () => treasuryApi.listMovements({ limit: 100, search }),
    placeholderData: keepPreviousData,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['treasury'] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: AccountPayload = {
        name: form.name,
        kind: form.kind,
        currency: form.currency,
        isActive: form.isActive,
        identifiers: identifiers
          .filter((i) => i.value.trim().length > 0)
          .map((i) => ({
            kind: i.kind,
            value: i.value.trim(),
            bankCode: i.bankCode.trim() || null,
          })),
      };

      if (editing) return treasuryApi.updateAccount(editing.id, payload);

      const account = await treasuryApi.createAccount(payload);

      // An opening balance is booked as a real movement. The balance is the
      // sum of the ledger, so setting the number directly would make the
      // account permanently fail reconciliation.
      const opening = Number(form.openingBalance);
      if (Number.isFinite(opening) && opening > 0) {
        await treasuryApi.createMovement({
          accountId: account.id,
          direction: 'in',
          amount: opening,
          concept: 'Saldo inicial',
        });
      }
      return account;
    },
    onSuccess: () => {
      invalidate();
      toast.success(editing ? 'Cuenta actualizada' : 'Cuenta creada');
      closeDialog();
    },
    onError: (error: unknown) =>
      toast.error(apiMessage(error, 'Error al guardar la cuenta')),
  });

  const removeMutation = useMutation({
    mutationFn: treasuryApi.removeAccount,
    onSuccess: () => {
      invalidate();
      toast.success('Cuenta eliminada');
    },
    onError: (error: unknown) =>
      toast.error(apiMessage(error, 'No se pudo eliminar')),
  });

  const reconcileMutation = useMutation({
    mutationFn: () => treasuryApi.reconcile(false),
    onSuccess: (report) => {
      if (report.mismatches.length === 0) {
        toast.success(`${report.checked} cuenta(s) revisada(s): todo cuadra`);
      } else {
        toast.error(
          `${report.mismatches.length} cuenta(s) descuadrada(s): ${report.mismatches
            .map((m) => `${m.name} (${m.drift})`)
            .join(', ')}`,
        );
      }
    },
  });

  function closeDialog() {
    setOpen(false);
    setEditing(null);
    setForm({ ...emptyAccount });
    setIdentifiers([]);
  }

  function openEdit(account: Account) {
    setEditing(account);
    setForm({
      name: account.name,
      kind: account.kind,
      currency: account.currency,
      isActive: account.isActive,
      identifiers: [],
      openingBalance: '',
    });
    setIdentifiers(
      account.identifiers.map((i) => ({
        kind: i.kind,
        value: i.value,
        bankCode: i.bankCode ?? '',
      })),
    );
    setOpen(true);
  }

  const totals = (accounts ?? []).reduce(
    (acc, account) => {
      if (!account.isActive) return acc;
      acc[account.currency] += Number(account.currentBalance);
      return acc;
    },
    { VES: 0, USD: 0 } as Record<'VES' | 'USD', number>,
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Tesoreria" subtitle="Cuentas, saldos y movimientos">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => reconcileMutation.mutate()}
            disabled={reconcileMutation.isPending}
            data-testid="treasury-reconcile"
          >
            {reconcileMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ScaleIcon className="mr-2 h-4 w-4" />
            )}
            Cuadrar
          </Button>
          <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : closeDialog())}>
            <DialogTrigger asChild>
              <Button data-testid="treasury-new-account">
                <Plus className="mr-2 h-4 w-4" /> Nueva Cuenta
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? 'Editar Cuenta' : 'Nueva Cuenta'}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="BDV Bs"
                    data-testid="account-name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select
                      value={form.kind}
                      onValueChange={(v) => setForm({ ...form, kind: v as AccountPayload['kind'] })}
                    >
                      <SelectTrigger data-testid="account-kind">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(ACCOUNT_KIND_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Moneda</Label>
                    <Select
                      value={form.currency}
                      onValueChange={(v) =>
                        setForm({ ...form, currency: v as AccountPayload['currency'] })
                      }
                    >
                      <SelectTrigger data-testid="account-currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="VES">Bolivares</SelectItem>
                        <SelectItem value="USD">Dolares</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {!editing && (
                  <div className="space-y-2">
                    <Label>Saldo inicial (opcional)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.openingBalance}
                      onChange={(e) => setForm({ ...form, openingBalance: e.target.value })}
                      placeholder="0.00"
                      data-testid="account-opening-balance"
                    />
                    <p className="text-xs text-muted-foreground">
                      Se registra como un movimiento de entrada, para que el saldo siempre
                      coincida con sus movimientos.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Como se reconoce en un comprobante</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setIdentifiers([...identifiers, { kind: 'last4', value: '', bankCode: '' }])
                      }
                      data-testid="account-add-identifier"
                    >
                      <Plus className="mr-1 h-3 w-3" /> Agregar
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Con esto el bot sabe si el dinero entro o salio: si la cuenta aparece en el
                    origen del comprobante salio plata, si aparece en el destino entro.
                  </p>

                  {identifiers.map((identifier, index) => (
                    <div key={index} className="flex gap-2">
                      <Select
                        value={identifier.kind}
                        onValueChange={(v) => {
                          const next = [...identifiers];
                          next[index] = { ...next[index], kind: v as IdentifierKind };
                          setIdentifiers(next);
                        }}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(IDENTIFIER_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={identifier.value}
                        placeholder={identifier.kind === 'phone' ? '04121234567' : '5678'}
                        onChange={(e) => {
                          const next = [...identifiers];
                          next[index] = { ...next[index], value: e.target.value };
                          setIdentifiers(next);
                        }}
                      />
                      {identifier.kind === 'last4' && (
                        <Input
                          className="w-24"
                          value={identifier.bankCode}
                          placeholder="0102"
                          onChange={(e) => {
                            const next = [...identifiers];
                            next[index] = { ...next[index], bankCode: e.target.value };
                            setIdentifiers(next);
                          }}
                        />
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setIdentifiers(identifiers.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>

                <Button
                  className="w-full"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || form.name.trim().length < 2}
                  data-testid="account-save"
                >
                  {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editing ? 'Actualizar' : 'Crear'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </PageHeader>

      <SearchInput
        value={searchValue}
        onChange={setSearchValue}
        placeholder="Buscar por referencia, concepto o cuenta..."
        label="Buscar movimientos"
        className="sm:max-w-sm"
        data-testid="treasury-search"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total en bolivares
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold" data-testid="total-ves">
              Bs {money.format(totals.VES)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total en dolares
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold" data-testid="total-usd">
              ${money.format(totals.USD)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts" data-testid="tab-accounts">
            <Coins className="mr-2 h-4 w-4" /> Cuentas
          </TabsTrigger>
          <TabsTrigger value="movements" data-testid="tab-movements">
            <ArrowRightLeft className="mr-2 h-4 w-4" /> Movimientos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-2 p-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !accounts || accounts.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  Sin cuentas registradas. Crea la primera para que el bot pueda reconocer tus
                  comprobantes.
                </p>
              ) : (
                <Table data-testid="accounts-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Codigo</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Identificadores</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((account) => (
                      <TableRow key={account.id} className={account.isActive ? '' : 'opacity-50'}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {account.code ?? '-'}
                        </TableCell>
                        <TableCell className="font-medium">
                          {account.name}
                          {!account.isActive && (
                            <Badge variant="secondary" className="ml-2">
                              Inactiva
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{ACCOUNT_KIND_LABELS[account.kind] ?? account.kind}</TableCell>
                        <TableCell className="space-x-1">
                          {account.identifiers.length === 0 ? (
                            <span className="text-xs text-muted-foreground">Sin identificar</span>
                          ) : (
                            account.identifiers.map((identifier) => (
                              <Badge key={identifier.id} variant="outline" className="font-mono">
                                {identifier.bankCode ? `${identifier.bankCode}·` : ''}
                                {identifier.value}
                              </Badge>
                            ))
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {account.currency === 'USD' ? '$' : 'Bs '}
                          {money.format(Number(account.currentBalance))}
                        </TableCell>
                        <TableCell className="text-right">
                          {/* Without this, an account whose opening balance was
                              never recorded cannot be fixed from the app. */}
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            data-testid="new-movement"
                            title="Registrar movimiento"
                            onClick={() => setMovementAccount(account)}
                          >
                            <CirclePlus className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon-xs" onClick={() => openEdit(account)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => removeMutation.mutate(account.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements">
          <Card>
            <CardContent className="p-0">
              {!movements || movements.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">Sin movimientos</p>
              ) : (
                <Table data-testid="movements-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Cuenta</TableHead>
                      <TableHead>Concepto</TableHead>
                      <TableHead>Contraparte</TableHead>
                      <TableHead>Referencia</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {movement.movementDate.slice(0, 10)}
                        </TableCell>
                        <TableCell>{movement.account.name}</TableCell>
                        <TableCell className="max-w-[220px] truncate">
                          {movement.concept ?? MOVEMENT_SOURCE_LABELS[movement.sourceType ?? ''] ?? '-'}
                        </TableCell>
                        <TableCell>{movement.counterparty ?? '-'}</TableCell>
                        <TableCell className="font-mono text-xs">{movement.reference ?? '-'}</TableCell>
                        <TableCell
                          className={`text-right font-medium tabular-nums ${
                            movement.direction === 'in' ? 'text-emerald-600' : 'text-red-600'
                          }`}
                        >
                          {movement.direction === 'in' ? '+' : '-'}
                          {movement.currency === 'USD' ? '$' : 'Bs '}
                          {money.format(Number(movement.amount))}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {MOVEMENT_DIRECTION_LABELS[movement.direction]}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AccountMovementDialog
        account={movementAccount}
        onClose={() => setMovementAccount(null)}
      />
    </div>
  );
}
