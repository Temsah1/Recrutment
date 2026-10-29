import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, EyeOff, GripVertical, Pencil, Plus, Power } from 'lucide-react';
import type { DepartmentDTO } from '@esme/shared';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { api, ApiError } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { cn } from '../../lib/cn';

interface DepartmentForm {
  name: string;
  slug: string;
  description: string;
  displayOrder: string;
  isActive: boolean;
}

const emptyForm: DepartmentForm = {
  name: '',
  slug: '',
  description: '',
  displayOrder: '100',
  isActive: true,
};

export function DepartmentsPage() {
  useDocumentTitle('Departments · ESME Recruitment');
  const toast = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: () => api.getDepartments(),
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentDTO | null>(null);
  const [form, setForm] = useState<DepartmentForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!modalOpen) return;
    if (editing) {
      setForm({
        name: editing.name,
        slug: editing.slug,
        description: editing.description,
        displayOrder: String(editing.displayOrder),
        isActive: editing.isActive,
      });
    } else {
      const nextOrder =
        Math.max(0, ...(query.data?.items.map((item) => item.displayOrder) ?? [0])) + 10;
      setForm({ ...emptyForm, displayOrder: String(nextOrder) });
    }
    setFormError(null);
  }, [modalOpen, editing, query.data?.items]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      if (name.length < 2) throw new ApiError(0, 'validation', 'Department name must be at least 2 characters.');
      const description = form.description.trim();
      if (description.length > 600) throw new ApiError(0, 'validation', 'Description must be at most 600 characters.');
      const displayOrder = Number(form.displayOrder);
      if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 999) {
        throw new ApiError(0, 'validation', 'Display order must be a whole number between 0 and 999.');
      }
      const body = {
        name,
        description,
        displayOrder,
        isActive: form.isActive,
        ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
      };
      return editing ? api.updateDepartment(editing.id, body) : api.createDepartment(body);
    },
    onSuccess: async () => {
      setModalOpen(false);
      toast.success(editing ? 'Department updated' : 'Department created', 'The public site reflects the change immediately.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'departments'] }),
        queryClient.invalidateQueries({ queryKey: ['public', 'config'] }),
      ]);
    },
    onError: (error) => {
      setFormError(error instanceof ApiError ? error.message : 'The department could not be saved.');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (department: DepartmentDTO) =>
      api.updateDepartment(department.id, { isActive: !department.isActive }),
    onSuccess: async (result) => {
      toast.success(
        result.department.isActive ? 'Department activated' : 'Department hidden',
        result.department.isActive
          ? `${result.department.name} appears on the public form.`
          : `${result.department.name} no longer accepts new selections.`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'departments'] }),
        queryClient.invalidateQueries({ queryKey: ['public', 'config'] }),
      ]);
    },
    onError: (error) => {
      toast.error('Department could not be updated', error instanceof ApiError ? error.message : 'Try again.');
    },
  });

  const departments = [...(query.data?.items ?? [])].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name),
  );
  const activeCount = departments.filter((department) => department.isActive).length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Recruitment"
        title="Departments"
        description="Departments are shown on the public landing page and in the application form. At least one active department must exist for the form to accept applications."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden />
            New department
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Badge tone="navy">{departments.length} total</Badge>
        <Badge tone="success" dot>
          {activeCount} active
        </Badge>
        {departments.length - activeCount > 0 ? (
          <Badge tone="neutral" dot>
            {departments.length - activeCount} hidden
          </Badge>
        ) : null}
      </div>

      {query.isLoading ? (
        <TableSkeleton rows={5} columns={5} />
      ) : query.isError ? (
        <div className="card p-8 text-center">
          <p className="text-sm font-semibold text-navy-900">Departments could not be loaded</p>
          <p className="mt-1 text-xs text-muted">
            {query.error instanceof ApiError ? query.error.message : 'Check the API connection.'}
          </p>
          <Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : departments.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No departments configured"
          description="Add at least one department so applicants can choose where they want to contribute."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add a department
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {departments.map((department) => (
            <article
              key={department.id}
              className={cn(
                'card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5',
                !department.isActive && 'bg-mist/60',
              )}
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-900/5 text-navy-700">
                  <Building2 className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-navy-900">{department.name}</h2>
                    {department.isActive ? (
                      <Badge tone="success" dot>
                        Active
                      </Badge>
                    ) : (
                      <Badge tone="neutral" dot>
                        Hidden
                      </Badge>
                    )}
                    <span className="inline-flex items-center gap-1 text-2xs text-muted">
                      <GripVertical className="h-3 w-3" aria-hidden />
                      order {department.displayOrder}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-2xs text-muted">/{department.slug}</p>
                  {department.description ? (
                    <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-navy-700">
                      {department.description}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  isLoading={toggleMutation.isPending && toggleMutation.variables?.id === department.id}
                  onClick={() => toggleMutation.mutate(department)}
                >
                  {department.isActive ? (
                    <>
                      <EyeOff className="h-3.5 w-3.5" aria-hidden />
                      Hide
                    </>
                  ) : (
                    <>
                      <Power className="h-3.5 w-3.5" aria-hidden />
                      Activate
                    </>
                  )}
                </Button>
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => {
                    setEditing(department);
                    setModalOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Edit
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="text-2xs leading-relaxed text-muted">
        Hidden departments are excluded from new applications but remain attached to applications already submitted.
        Changing a slug affects filters and links that use the old slug.
      </p>

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editing ? 'Edit department' : 'New department'}
        description="The name and description are public. Display order controls their position on the landing page."
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saveMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={() => saveMutation.mutate()} isLoading={saveMutation.isPending}>
              {editing ? 'Save changes' : 'Create department'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError ? (
            <p role="alert" className="rounded-lg border border-danger-100 bg-danger-50 p-3 text-xs font-medium text-danger-700">
              {formError}
            </p>
          ) : null}
          <label className="block">
            <span className="field-label">Name</span>
            <input
              className="input"
              value={form.name}
              maxLength={80}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Frontend Development"
            />
          </label>
          <label className="block">
            <span className="field-label">Slug</span>
            <input
              className="input font-mono text-xs"
              value={form.slug}
              maxLength={60}
              onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
              placeholder="frontend-development"
            />
            <span className="field-hint">
              {editing
                ? 'Used in filter links. Change only if necessary.'
                : 'Optional. Generated from the name when left empty.'}
            </span>
          </label>
          <label className="block">
            <span className="field-label">Description</span>
            <textarea
              className="textarea min-h-[5rem]"
              maxLength={600}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="What this department works on and who should join."
            />
            <span className="field-hint">{form.description.length} / 600 characters</span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Display order</span>
              <input
                type="number"
                min={0}
                max={999}
                className="input"
                value={form.displayOrder}
                onChange={(event) => setForm((current) => ({ ...current, displayOrder: event.target.value }))}
              />
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-line p-3">
              <input
                type="checkbox"
                className="checkbox mt-0.5"
                checked={form.isActive}
                onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
              />
              <span>
                <span className="block text-xs font-semibold text-navy-900">Active</span>
                <span className="mt-0.5 block text-2xs leading-relaxed text-muted">
                  Visible on the public form and landing page.
                </span>
              </span>
            </label>
          </div>
        </div>
      </Modal>
    </div>
  );
}
