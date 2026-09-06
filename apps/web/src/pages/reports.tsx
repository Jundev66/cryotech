import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BATCH_STATUS_LABELS, TRANSACTION_CATEGORY_LABELS, formatCurrency, formatNumber, formatDate, formatUsd } from '@cryotech/shared-types';
import type { BatchProfitability } from '@cryotech/shared-types';
import { reportsApi } from '@/api/reports.api';
import { batchesApi } from '@/api/batches.api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/layout/page-header';
import { DollarSign, TrendingUp } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, AreaChart, Area,
} from 'recharts';

export default function ReportsPage() {
  const [selectedBatch, setSelectedBatch] = useState('');

  const { data: batches } = useQuery({ queryKey: ['batches'], queryFn: () => batchesApi.findAll() });
  const { data: fcr, isLoading: fcrLoading } = useQuery({
    queryKey: ['reports', 'fcr', selectedBatch],
    queryFn: () => reportsApi.getFcr(selectedBatch),
    enabled: !!selectedBatch,
  });
  const { data: growthCurve, isLoading: growthLoading } = useQuery({
    queryKey: ['reports', 'growth-curve', selectedBatch],
    queryFn: () => reportsApi.getGrowthCurve(selectedBatch),
    enabled: !!selectedBatch,
  });
  const { data: revenue, isLoading: revenueLoading } = useQuery({
    queryKey: ['reports', 'revenue'],
    queryFn: reportsApi.getRevenue,
  });
  const { data: topBatches, isLoading: topLoading } = useQuery({
    queryKey: ['reports', 'top-batches'],
    queryFn: reportsApi.getTopBatches,
  });
  const { data: profitability, isLoading: profitLoading } = useQuery({
    queryKey: ['reports', 'batch-profitability'],
    queryFn: reportsApi.getBatchProfitability,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Reportes" subtitle="Analisis de rendimiento y eficiencia" />

      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">Seleccionar lote:</span>
        <Select onValueChange={setSelectedBatch} value={selectedBatch}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Seleccionar lote para analisis" />
          </SelectTrigger>
          <SelectContent>
            {batches?.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.breed} - {formatDate(b.startDate)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* FCR Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display">FCR (Conversion Alimenticia)</CardTitle>
            <CardDescription>Evolucion del FCR del lote seleccionado</CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedBatch ? (
              <p className="py-8 text-center text-muted-foreground">Selecciona un lote</p>
            ) : fcrLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : fcr && fcr.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={fcr}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="fcr" fill="var(--chart-1)" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-muted-foreground">Sin datos de FCR</p>
            )}
          </CardContent>
        </Card>

        {/* Growth Curve */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Curva de Crecimiento</CardTitle>
            <CardDescription>Peso real vs estandar de la raza</CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedBatch ? (
              <p className="py-8 text-center text-muted-foreground">Selecciona un lote</p>
            ) : growthLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : growthCurve && growthCurve.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={growthCurve}>
                  <CartesianGrid strokeDasharray="3 3" />
                  {/* Unit on the tick: as an axis label it overlapped the legend. */}
                  <XAxis dataKey="day" tickFormatter={(day: number) => `${day} d`} />
                  <YAxis label={{ value: 'Peso (g)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="actualWeight" name="Peso real" stroke="var(--chart-1)" strokeWidth={2} />
                  <Line type="monotone" dataKey="standardWeight" name="Estandar" stroke="var(--chart-3)" strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-muted-foreground">Sin datos de crecimiento</p>
            )}
          </CardContent>
        </Card>

        {/* Revenue Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-display">Ingresos vs Gastos</CardTitle>
            <CardDescription>Comparacion mensual</CardDescription>
          </CardHeader>
          <CardContent>
            {revenueLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : revenue && revenue.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={revenue}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  {/* In thousands: a bolivar figure runs to six digits and the axis clipped it. */}
                  <YAxis width={64} tickFormatter={(value: number) => `${formatNumber(value / 1000)} k`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Area type="monotone" dataKey="income" name="Ingresos" fill="var(--chart-2)" stroke="var(--chart-2)" fillOpacity={0.3} />
                  <Area type="monotone" dataKey="expense" name="Gastos" fill="var(--chart-5)" stroke="var(--chart-5)" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-muted-foreground">Sin datos de ingresos/gastos</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Batch Profitability */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display">Rentabilidad por Lote</CardTitle>
          <CardDescription>Costo por pollo, precio de venta promedio y margen de ganancia</CardDescription>
        </CardHeader>
        <CardContent>
          {profitLoading ? (
            <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-48 w-full" />)}</div>
          ) : !profitability || profitability.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Sin datos</p>
          ) : (
            <div className="space-y-6">
              {profitability.map((b) => (
                <BatchProfitabilityCard key={b.batchId} data={b} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Batches */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display">Mejores Lotes</CardTitle>
          <CardDescription>Ranking de lotes por rendimiento</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {topLoading ? (
            <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !topBatches || topBatches.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Sin datos</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Raza</TableHead>
                  <TableHead>Inicio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Inicial</TableHead>
                  <TableHead className="text-right">Mortalidad</TableHead>
                  <TableHead className="text-right">Ultimo Peso</TableHead>
                  <TableHead className="text-right">Ingresos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topBatches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.breed}</TableCell>
                    <TableCell>{formatDate(b.startDate)}</TableCell>
                    <TableCell><Badge variant="outline">{BATCH_STATUS_LABELS[b.status] || b.status}</Badge></TableCell>
                    <TableCell className="text-right">{formatNumber(b.initialQty)}</TableCell>
                    <TableCell className="text-right">{formatNumber(b.mortalityRate, 1)}%</TableCell>
                    <TableCell className="text-right">{formatNumber(b.lastWeight)} g</TableCell>
                    <TableCell className="text-right">{formatCurrency(b.totalRevenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BatchProfitabilityCard({ data: b }: { data: BatchProfitability }) {
  const hasRevenue = b.soldCount > 0;

  return (
    <div className="rounded-lg border p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-muted-foreground">{b.code}</span>
          <span className="font-semibold">{b.breed}</span>
          <Badge variant="outline">{BATCH_STATUS_LABELS[b.status] || b.status}</Badge>
        </div>
        <span className="text-sm text-muted-foreground">Inicio: {formatDate(b.startDate)}</span>
      </div>

      {/* Chicken Distribution */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="rounded-md border p-2 text-center">
          <div className="text-xs text-muted-foreground">Inicial</div>
          <div className="text-lg font-bold">{b.initialQuantity}</div>
        </div>
        <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-2 text-center">
          <div className="text-xs text-emerald-700 dark:text-emerald-400">En Corral</div>
          <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{b.inCorral}</div>
        </div>
        <div className="rounded-md border p-2 text-center">
          <div className="text-xs text-muted-foreground">Beneficiados</div>
          <div className="text-lg font-bold">{b.processedCount}</div>
        </div>
        <div className="rounded-md border p-2 text-center">
          <div className="text-xs text-muted-foreground">Vendidos</div>
          <div className="text-lg font-bold">{b.soldCount}
            {(b.soldLiveCount > 0 || b.soldDeadCount > 0) && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                ({b.soldLiveCount}V / {b.soldDeadCount}B)
              </span>
            )}
          </div>
        </div>
        <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 p-2 text-center">
          <div className="text-xs text-red-600">Muertos</div>
          <div className="text-lg font-bold text-red-600">{b.mortality} <span className="text-xs font-normal">({formatNumber(b.mortalityPct, 1)}%)</span></div>
        </div>
      </div>

      {/* Cost Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-md bg-muted/50 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <DollarSign className="h-3 w-3" /> Gastos Totales
          </div>
          <div className="mt-1 text-lg font-bold text-red-600">{formatCurrency(b.totalExpenses)}</div>
        </div>
        <div className="rounded-md bg-muted/50 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <DollarSign className="h-3 w-3" /> Costo/Pollo
          </div>
          <div className="mt-1 text-lg font-bold">{formatCurrency(b.costPerChicken)}</div>
        </div>
        <div className="rounded-md bg-muted/50 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <DollarSign className="h-3 w-3" /> Ingresos Venta
          </div>
          <div className="mt-1 text-lg font-bold text-emerald-600">{formatUsd(b.totalRevenueUsd)} <span className="text-sm font-normal text-muted-foreground">({formatCurrency(b.totalRevenueBs)})</span></div>
        </div>
      </div>

      {/* Expense Breakdown */}
      {b.expenseBreakdown.length > 0 && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">Desglose de gastos</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {b.expenseBreakdown.map((e) => (
              <Badge key={e.category} variant="secondary">
                {TRANSACTION_CATEGORY_LABELS[e.category] || e.category}: {formatCurrency(e.amount)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Profitability */}
      {hasRevenue ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <span className="text-xs text-muted-foreground">Precio Prom./kg</span>
              <div className="font-semibold">{formatUsd(b.avgPricePerKg)}</div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Peso Prom. Venta</span>
              <div className="font-semibold">{formatNumber(b.avgWeightKg, 2)} kg</div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Ingreso/Pollo (Bs)</span>
              <div className="font-semibold text-emerald-600">{formatCurrency(b.avgRevenuePerChickenBs)}</div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Ganancia/Pollo</span>
              <div className={`font-bold text-lg ${b.profitPerChickenBs >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatCurrency(b.profitPerChickenBs)}
              </div>
            </div>
          </div>

          {/* Margin & Projection */}
          <div className={`flex items-center gap-4 rounded-md p-3 ${b.marginPct >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-red-50 dark:bg-red-950/30'}`}>
            <TrendingUp className={`h-5 w-5 ${b.marginPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
            <div className="flex-1">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-sm">
                  Margen: <strong className={b.marginPct >= 0 ? 'text-emerald-600' : 'text-red-600'}>{formatNumber(b.marginPct, 1)}%</strong>
                </span>
                <span className="text-sm text-muted-foreground">|</span>
                <span className="text-sm">
                  Tasa: <strong>{formatNumber(b.exchangeRate, 2)} Bs/$</strong>
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Proyeccion si vendes los {b.inCorral} en corral al precio actual: {formatCurrency(b.projectedRevenueBs)} — Ganancia neta {formatCurrency(b.projectedProfitBs)}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-md bg-muted/30 p-3 text-center">
          <p className="text-sm text-muted-foreground">Sin ventas aun — el precio promedio se calculara con la primera venta</p>
          <p className="mt-1 text-xs text-muted-foreground">
            En corral: <strong>{b.inCorral}</strong> | Costo por pollo: <strong>{formatCurrency(b.costPerChicken)}</strong>
          </p>
        </div>
      )}
    </div>
  );
}
