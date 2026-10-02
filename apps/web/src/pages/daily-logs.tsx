import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDate, formatNumber } from '@cryotech/shared-types';
import { dailyLogsApi } from '@/api/daily-logs.api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Pill } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { toast } from 'sonner';

const PAGE_SIZE = 12;

function healthScoreColor(score: number): string {
  if (score >= 4 || score >= 80) return 'text-emerald-600';
  if (score >= 3 || score >= 60) return 'text-amber-600';
  return 'text-red-600';
}

export default function DailyLogsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const { data: logs, isLoading } = useQuery({
    queryKey: ['daily-logs'],
    queryFn: () => dailyLogsApi.findAll(),
  });

  const deleteMutation = useMutation({
    mutationFn: dailyLogsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-logs'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      toast.success('Registro eliminado');
    },
  });

  const allLogs = [...(logs || [])].sort((a, b) => b.logDate.localeCompare(a.logDate));
  const totalPages = Math.ceil(allLogs.length / PAGE_SIZE) || 1;
  const paginatedLogs = allLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader title="Registros Diarios" subtitle="Control diario de biometría, consumo y ambiente">
        <Button asChild data-testid="new-daily-log">
          <Link to="/dashboard/daily-logs/new">
            <Plus className="mr-2 h-4 w-4" /> Nuevo Registro
          </Link>
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : allLogs.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Sin registros diarios</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Lote / Raza</TableHead>
                    <TableHead className="text-right">Mortalidad</TableHead>
                    <TableHead className="text-right">Peso Prom. (g)</TableHead>
                    <TableHead className="text-right">Agua (L)</TableHead>
                    <TableHead className="text-right">Alimento (kg)</TableHead>
                    <TableHead className="text-center">Medicina</TableHead>
                    <TableHead className="text-center">Salud</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedLogs.map((log) => (
                    <TableRow key={log.id} data-testid="daily-log-row">
                      <TableCell>{formatDate(log.logDate)}</TableCell>
                      <TableCell>{log.batch?.breed || '-'}</TableCell>
                      <TableCell className="text-right">{log.mortality}</TableCell>
                      <TableCell className="text-right">{log.averageWeightG ?? '-'}</TableCell>
                      <TableCell className="text-right">{log.waterConsumedL ?? '-'}</TableCell>
                      <TableCell className="text-right">
                        {log.feedConsumedKg ? (
                          <span title={log.feedProduct?.name}>{formatNumber(Number(log.feedConsumedKg), 3)}</span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {log.medicineAdministered ? (
                          <span title={log.medicineProduct?.name ? `${log.medicineProduct.name} - ${log.medicineQuantity ?? ''}${log.medicineProduct.measurementUnit?.abbreviation ?? 'ml'}` : log.medicineNotes ?? ''}>
                            <Pill className="h-4 w-4 inline text-emerald-600" />
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">No</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {log.healthScore != null ? (
                          <span className={`font-semibold ${healthScoreColor(log.healthScore)}`}>
                            {log.healthScore}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => deleteMutation.mutate(log.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <PaginationControls
                page={page}
                totalPages={totalPages}
                totalItems={allLogs.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                itemName="registros"
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
