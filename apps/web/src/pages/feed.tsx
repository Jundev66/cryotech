import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { feedFormulaSchema, BREEDS, type FeedFormulaInput, FEED_PHASE_LABELS, DEFAULT_ENGORDE_START_WEEK, feedPhaseConfigSchema, type FeedPhaseConfigInput } from '@cryotech/shared-types';
import { formatNumber } from '@cryotech/shared-types';
import { feedApi } from '@/api/feed.api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Loader2, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

export default function FeedPage() {
  const queryClient = useQueryClient();
  const [formulaOpen, setFormulaOpen] = useState(false);

  const { data: formulas, isLoading: formulasLoading } = useQuery({ queryKey: ['feed', 'formulas'], queryFn: feedApi.getFormulas });

  const createFormulaMutation = useMutation({
    mutationFn: feedApi.createFormula,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed', 'formulas'] });
      toast.success('Formula creada');
      setFormulaOpen(false);
      formulaForm.reset();
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al crear formula')),
  });

  const deleteFormulaMutation = useMutation({
    mutationFn: feedApi.removeFormula,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed', 'formulas'] });
      toast.success('Formula eliminada');
    },
  });

  const formulaForm = useForm<FeedFormulaInput>({
    resolver: zodResolver(feedFormulaSchema),
    defaultValues: { breed: '', weekNumber: 1, dailyFeedPerBirdG: 0 },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Formulas de Alimento" subtitle="Configuracion de formulas y fases de alimentacion" />

      <Tabs defaultValue="formulas">
        <TabsList>
          <TabsTrigger value="formulas">Formulas</TabsTrigger>
          <TabsTrigger value="phases">Fases</TabsTrigger>
        </TabsList>

        <TabsContent value="formulas" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={formulaOpen} onOpenChange={setFormulaOpen}>
              <DialogTrigger asChild>
                <Button data-testid="new-formula"><Plus className="mr-2 h-4 w-4" /> Nueva Formula</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Nueva Formula de Alimentacion</DialogTitle></DialogHeader>
                <Form {...formulaForm}>
                  <form onSubmit={formulaForm.handleSubmit((v) => createFormulaMutation.mutate(v))} className="space-y-4">
                    <FormField control={formulaForm.control} name="breed" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Raza</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger className="w-full" data-testid="formula-breed"><SelectValue placeholder="Seleccionar" /></SelectTrigger></FormControl>
                          <SelectContent>{BREEDS.map((b) => (<SelectItem key={b} value={b}>{b}</SelectItem>))}</SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={formulaForm.control} name="weekNumber" render={({ field }) => (
                      <FormItem><FormLabel>Semana</FormLabel><FormControl><Input type="number" min={1} max={10} {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={formulaForm.control} name="feedPhase" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fase (opcional)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ''}>
                          <FormControl><SelectTrigger className="w-full" data-testid="formula-phase"><SelectValue placeholder="Todas las fases" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="inicio">Inicio</SelectItem>
                            <SelectItem value="engorde">Engorde</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={formulaForm.control} name="dailyFeedPerBirdG" render={({ field }) => (
                      <FormItem><FormLabel>Gramos / ave / dia</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <Button type="submit" className="w-full" disabled={createFormulaMutation.isPending}>
                      {createFormulaMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Crear formula
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              {formulasLoading ? (
                <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : !formulas || formulas.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">Sin formulas registradas</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Raza</TableHead>
                      <TableHead className="text-right">Semana</TableHead>
                      <TableHead>Fase</TableHead>
                      <TableHead className="text-right">g / ave / dia</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formulas.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">{f.breed}</TableCell>
                        <TableCell className="text-right">{f.weekNumber}</TableCell>
                        <TableCell>{f.feedPhase ? FEED_PHASE_LABELS[f.feedPhase] : 'Todas'}</TableCell>
                        <TableCell className="text-right">{formatNumber(f.dailyFeedPerBirdG, 1)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon-xs" onClick={() => deleteFormulaMutation.mutate(f.id)}><Trash2 className="h-3 w-3" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="phases" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">Configuracion de Fases por Raza</CardTitle>
              <CardDescription>Define en que semana comienza la fase de engorde para cada raza</CardDescription>
            </CardHeader>
            <CardContent>
              <PhaseConfigSection />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PhaseConfigSection() {
  const queryClient = useQueryClient();
  const { data: phaseConfigs, isLoading } = useQuery({
    queryKey: ['feed', 'phase-configs'],
    queryFn: feedApi.getPhaseConfigs,
  });

  const form = useForm<FeedPhaseConfigInput>({
    resolver: zodResolver(feedPhaseConfigSchema),
    defaultValues: { breed: '', engordeStartWeek: DEFAULT_ENGORDE_START_WEEK },
  });

  const createMutation = useMutation({
    mutationFn: feedApi.createPhaseConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed', 'phase-configs'] });
      toast.success('Configuracion guardada');
      form.reset();
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al guardar')),
  });

  return (
    <div className="space-y-4">
      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="flex items-end gap-3">
          <FormField control={form.control} name="breed" render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel>Raza</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger className="w-full"><SelectValue placeholder="Seleccionar" /></SelectTrigger></FormControl>
                <SelectContent>{BREEDS.map((b) => (<SelectItem key={b} value={b}>{b}</SelectItem>))}</SelectContent>
              </Select>
            </FormItem>
          )} />
          <FormField control={form.control} name="engordeStartWeek" render={({ field }) => (
            <FormItem>
              <FormLabel>Semana inicio engorde</FormLabel>
              <FormControl><Input type="number" min={1} max={10} className="w-24" {...field} /></FormControl>
            </FormItem>
          )} />
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
          </Button>
        </form>
      </Form>

      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : !phaseConfigs || phaseConfigs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin configuraciones. Se usara semana {DEFAULT_ENGORDE_START_WEEK} por defecto.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Raza</TableHead>
              <TableHead className="text-right">Semana inicio engorde</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {phaseConfigs.map((pc) => (
              <TableRow key={pc.id}>
                <TableCell className="font-medium">{pc.breed}</TableCell>
                <TableCell className="text-right">{pc.engordeStartWeek}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
