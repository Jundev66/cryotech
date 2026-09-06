import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { roleSchema, type RoleInput, PERMISSIONS_MODULES, PERMISSIONS_ACTIONS } from '@cryotech/shared-types';
import { membersApi } from '@/api/members.api';
import { rolesApi } from '@/api/roles.api';
import { useCompany } from '@/providers/company-provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Loader2, Trash2, UserPlus, KeyRound } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { MemberPasswordDialog } from '@/components/forms/member-password-dialog';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { company } = useCompany();
  const companyId = company?.id ?? '';

  const [memberOpen, setMemberOpen] = useState(false);
  const [passwordFor, setPasswordFor] = useState<{ id: string; name: string } | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [email, setEmail] = useState('');

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ['members', companyId],
    queryFn: () => membersApi.findAll(companyId),
    enabled: !!companyId,
  });

  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ['roles', companyId],
    queryFn: () => rolesApi.findAll(companyId),
    enabled: !!companyId,
  });

  const addMemberMutation = useMutation({
    mutationFn: (email: string) => membersApi.add(companyId, { email }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', companyId] });
      toast.success('Miembro agregado');
      setMemberOpen(false);
      setEmail('');
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al agregar miembro')),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => membersApi.remove(companyId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', companyId] });
      toast.success('Miembro eliminado');
    },
  });

  const defaultPermissions: RoleInput['permissions'] = {
    batches: { view: false, create: false, edit: false, delete: false },
    daily_logs: { view: false, create: false, edit: false, delete: false },
    sales: { view: false, create: false, edit: false, delete: false },
    transactions: { view: false, create: false, edit: false, delete: false },
    clients: { view: false, create: false, edit: false, delete: false },
    products: { view: false, create: false, edit: false, delete: false },
    warehouses: { view: false, create: false, edit: false, delete: false },
    entries: { view: false, create: false, edit: false, delete: false },
    processing: { view: false, create: false, edit: false, delete: false },
    // It was in PERMISSIONS_MODULES and in the form, but not here nor in the
    // schema: ticking its boxes saved nothing.
    treasury: { view: false, create: false, edit: false, delete: false },
    reports: { view: false },
    settings: { view: false, edit: false },
    users: { view: false, create: false, edit: false, delete: false },
  };

  const roleForm = useForm<RoleInput>({
    resolver: zodResolver(roleSchema),
    defaultValues: { name: '', permissions: defaultPermissions },
  });

  const createRoleMutation = useMutation({
    mutationFn: (data: RoleInput) => rolesApi.create(companyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles', companyId] });
      toast.success('Rol creado');
      setRoleOpen(false);
      roleForm.reset();
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al crear rol')),
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (roleId: string) => rolesApi.remove(companyId, roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles', companyId] });
      toast.success('Rol eliminado');
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Usuarios y Roles" subtitle="Gestion de miembros y permisos" />

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Miembros</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
              <DialogTrigger asChild>
                <Button data-testid="add-member"><UserPlus className="mr-2 h-4 w-4" /> Agregar Miembro</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Agregar Miembro</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); addMemberMutation.mutate(email); }} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Email del usuario</label>
                    <Input type="email" data-testid="member-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@correo.com" required />
                  </div>
                  <Button type="submit" className="w-full" data-testid="submit-member" disabled={addMemberMutation.isPending}>
                    {addMemberMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Agregar
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              {membersLoading ? (
                <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : !members || members.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">Sin miembros</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">
                          {m.user?.fullName || 'Sin nombre'}
                          {m.isOwner && <Badge variant="secondary" className="ml-2">Propietario</Badge>}
                        </TableCell>
                        <TableCell>{m.user?.email || '-'}</TableCell>
                        <TableCell>{m.role?.name || 'Sin rol'}</TableCell>
                        <TableCell className="text-right">
                          {/* Al propietario no: la API lo rechaza, y ofrecerlo
                              aquí solo llevaría a un error. Su contraseña se
                              cambia con scripts/reset-password.ts. */}
                          {!m.isOwner && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                title="Cambiar contraseña"
                                data-testid="member-set-password"
                                onClick={() =>
                                  setPasswordFor({ id: m.id, name: m.user?.fullName || m.user?.email || 'este usuario' })
                                }
                              >
                                <KeyRound className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon-xs" onClick={() => removeMemberMutation.mutate(m.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> Nuevo Rol</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Crear Rol</DialogTitle></DialogHeader>
                <Form {...roleForm}>
                  <form onSubmit={roleForm.handleSubmit((v) => createRoleMutation.mutate(v))} className="space-y-4">
                    <FormField control={roleForm.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel>Nombre del rol</FormLabel><FormControl><Input placeholder="Ej: Operario" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div>
                      <h3 className="mb-2 text-sm font-medium">Permisos</h3>
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Modulo</TableHead>
                              {PERMISSIONS_ACTIONS.map((a) => (
                                <TableHead key={a} className="text-center capitalize">{a === 'view' ? 'Ver' : a === 'create' ? 'Crear' : a === 'edit' ? 'Editar' : 'Eliminar'}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {PERMISSIONS_MODULES.map((mod) => (
                              <TableRow key={mod.key}>
                                <TableCell>{mod.label}</TableCell>
                                {PERMISSIONS_ACTIONS.map((action) => {
                                  const fieldName = `permissions.${mod.key}.${action}` as const;
                                  const hasAction = mod.key === 'reports'
                                    ? action === 'view'
                                    : mod.key === 'settings'
                                      ? action === 'view' || action === 'edit'
                                      : true;
                                  if (!hasAction) return <TableCell key={action} className="text-center">-</TableCell>;
                                  return (
                                    <TableCell key={action} className="text-center">
                                      <FormField
                                        control={roleForm.control}
                                        name={fieldName as FieldPath<RoleInput>}
                                        render={({ field }) => (
                                          <Checkbox
                                            checked={field.value as boolean}
                                            onCheckedChange={field.onChange}
                                          />
                                        )}
                                      />
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={createRoleMutation.isPending}>
                      {createRoleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Crear rol
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              {rolesLoading ? (
                <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : !roles || roles.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">Sin roles creados</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Permisos</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roles.map((r) => {
                      const permCount = Object.values(r.permissions).reduce((sum, mod) => {
                        return sum + Object.values(mod as Record<string, boolean>).filter(Boolean).length;
                      }, 0);
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell><Badge variant="secondary">{permCount} permisos</Badge></TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon-xs" onClick={() => deleteRoleMutation.mutate(r.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <MemberPasswordDialog
        companyId={companyId}
        member={passwordFor}
        onClose={() => setPasswordFor(null)}
      />
    </div>
  );
}
