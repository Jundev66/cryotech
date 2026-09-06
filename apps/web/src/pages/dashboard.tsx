import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/api/dashboard.api';
import { BATCH_STATUS_LABELS } from '@cryotech/shared-types';
import { formatCurrency, formatDate, formatNumber } from '@cryotech/shared-types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/page-header';
import { StatCard } from '@/components/layout/stat-card';
import { Layers, Bird, Skull, DollarSign } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const STATUS_CHART_COLORS = ['#2dd4bf', '#34d399', '#fbbf24', '#94a3b8'];

/** The API sends the table name; the UI is in Spanish. */
const ACTIVITY_LABELS: Record<string, string> = {
  daily_log: 'Registro diario',
  sale: 'Venta',
  transaction: 'Movimiento',
};

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: dashboardApi.getStats,
  });

  const { data: statusDist, isLoading: distLoading } = useQuery({
    queryKey: ['dashboard', 'status-distribution'],
    queryFn: dashboardApi.getStatusDistribution,
  });

  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['dashboard', 'recent-activity'],
    queryFn: dashboardApi.getRecentActivity,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Resumen general de tu operacion avicola" />

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsLoading ? (
          [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)
        ) : (
          <>
            <StatCard
              title="Lotes Activos"
              value={formatNumber(stats?.activeBatches ?? 0)}
              icon={Layers}
              color="bg-primary/10 text-primary"
            />
            <StatCard
              title="Aves Vivas"
              value={formatNumber(stats?.totalAlive ?? 0)}
              icon={Bird}
              color="bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400"
            />
            <StatCard
              title="Mortalidad"
              value={`${formatNumber(stats?.mortalityPct ?? 0, 1)}%`}
              icon={Skull}
              color="bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
            />
            <StatCard
              title="Ingresos Totales"
              value={formatCurrency(stats?.totalRevenue ?? 0)}
              icon={DollarSign}
              color="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Batch Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Distribucion de Lotes</CardTitle>
            <CardDescription>Estado actual de todos los lotes</CardDescription>
          </CardHeader>
          <CardContent>
            {distLoading ? (
              <Skeleton className="mx-auto h-48 w-48 rounded-full" />
            ) : statusDist && statusDist.length > 0 ? (
              <div className="flex items-center justify-center gap-8">
                <ResponsiveContainer width={200} height={200}>
                  <PieChart>
                    <Pie
                      data={statusDist}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="count"
                      nameKey="status"
                    >
                      {statusDist.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={STATUS_CHART_COLORS[index % STATUS_CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [value, BATCH_STATUS_LABELS[name] || name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {statusDist.map((item, index) => (
                    <div key={item.status} className="flex items-center gap-2">
                      <div
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: STATUS_CHART_COLORS[index % STATUS_CHART_COLORS.length] }}
                      />
                      <span className="text-sm">{BATCH_STATUS_LABELS[item.status] || item.status}</span>
                      <Badge variant="secondary" className="ml-auto">{item.count}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">Sin lotes registrados</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Actividad Reciente</CardTitle>
            <CardDescription>Ultimas acciones en el sistema</CardDescription>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : activity && activity.length > 0 ? (
              <div className="space-y-3">
                {activity.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 border-b pb-3 last:border-0">
                    <div className="h-2 w-2 shrink-0 rounded-full bg-primary/60" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.description}</p>
                      <p className="text-xs text-muted-foreground">{ACTIVITY_LABELS[item.type] ?? item.type}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(item.date)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">Sin actividad reciente</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
