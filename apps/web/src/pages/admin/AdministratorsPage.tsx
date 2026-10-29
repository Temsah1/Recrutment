import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  KeyRound,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  UserPlus,
  Users,
} from 'lucide-react';
import { ROLES, ROLE_LABELS, type AdminUserDTO, type Role } from '@esme/shared';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { Modal } from '../../components/ui/Modal';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../auth/AuthProvider';
import { api, ApiError } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { formatDateTime } from '../../lib/format';
import { cn } from '../../lib/cn';

const roleTone: Record<Role, 'navy' | 'info' | 'neutral'> = {
  super_admin: 'navy',
  recruitment_admin: 'info',
  reviewer: 'neutral',
};

const roleHints: Record<Role, string> = {
  super_admin: 'Full access, including settings, administrators, audit, backups and retention.',
  recruitment_admin: 'Applications, decisions, assignment, cycles and CSV exports. No security settings.',
  reviewer: 'Reads assigned applications and writes internal notes. Cannot make decisions or download files.',
};

interface CreateForm {
  email: string;
  displayName: string;
  role: Role;
  password: string;
  confirm: string;
}

interface EditForm {
  displayName: string;
  role: Role;
  isActive: boolean;
}

export function AdministratorsPage() {
  useDocumentTitle('Administrators · ESME Recruitment');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const currentId = session?.administrator.id ?? null;

  const query = useQuery({
    queryKey: ['admin', 'administrators'],
    queryFn: () => api.getAdministrators(),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>({
    email: '',
    displayName: '',
    role: 'reviewer',
    password: '',
    confirm: '',
  });
  const [createError, setCreateError] = useState<string | null>(null);

  const [editing, setEditing] = useState<AdminUserDTO | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ displayName: '', role: 'reviewer', isActive: true });
  const [editError, setEditError] = useState<string | null>(null);

  const [resetting, setResetting] = useState<AdminUserDTO | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    setEditForm({ displayName: editing.displayName, role: editing.role, isActive: editing.isActive });
    setEditError(null);
  }, [editing]);

  useEffect(() => {
    if (!resetting) return;
    setNewPassword('');
    setConfirmPassword('');
    setResetError(null);
  }, [resetting]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const email = createForm.email.trim();
      const displayName = createForm.displayName.trim();
      if (!email.includes('@')) throw new ApiError(0, 'validation', 'Enter a valid email address.');
      if (displayName.length < 2) throw new ApiError(0, 'validation', 'Display name must be at least 2 characters.');
      if (createForm.password.length < 12) {
        throw new ApiError(0, 'validation', 'Use a password of at least 12 characters.');
      }
      if (createForm.password !== createForm.confirm) {
        throw new ApiError(0, 'validation', 'The passwords do not match.');
      }
      return api.createAdministrator({
        email,
        displayName,
        role: createForm.role,
        password: createForm.password,
      });
    },
    onSuccess: async (result) => {
      setCreateOpen(false);
      setCreateForm({ email: '', displayName: '', role: 'reviewer', password: '', confirm: '' });
      toast.success('Administrator created', `${result.administrator.displayName} can now sign in.`);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'administrators'] });
    },
    onError: (error) =>
      setCreateError(error instanceof ApiError ? error.message : 'The administrator could not be created.'),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editing) throw new ApiError(0, 'validation', 'No administrator selected.');
      const displayName = editForm.displayName.trim();
      if (displayName.length < 2) throw new ApiError(0, 'validation', 'Display name must be at least 2 characters.');
      return api.updateAdministrator(editing.id, {
        displayName,
        role: editForm.role,
        isActive: editForm.isActive,
      });
    },
    onSuccess: async () => {
      setEditing(null);
      toast.success('Administrator updated', 'Role and access changes are effective immediately.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'administrators'] });
    },
    onError: (error) =>
      setEditError(error instanceof ApiError ? error.message : 'The administrator could not be updated.'),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      if (!resetting) throw new ApiError(0, 'validation', 'No administrator selected.');
      if (newPassword.length < 12) throw new ApiError(0, 'validation', 'Use a password of at least 12 characters.');
      if (newPassword !== confirmPassword) throw new ApiError(0, 'validation', 'The passwords do not match.');
      await api.resetAdministratorPassword(resetting.id, newPassword);
    },
    onSuccess: async () => {
      const name = resetting?.displayName ?? 'The administrator';
      setResetting(null);
      toast.success('Password reset', `${name} must sign in again with the new password.`);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'administrators'] });
    },
    onError: (error) =>
      setResetError(error instanceof ApiError ? error.message : 'The password could not be reset.'),
  });

  const administrators = query.data?.items ?? [];
  const activeCount = administrators.filter((admin) => admin.isActive).length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Administrators"
        description="Manage who can access the recruitment dashboard and what each person is allowed to do."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4" aria-hidden />
            Add administrator
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="navy">
          <Users className="h-3 w-3" aria-hidden />
          {administrators.length} accounts
        </Badge>
        <Badge tone="success" dot>
          {activeCount} active
        </Badge>
        {administrators.length - activeCount > 0 ? (
          <Badge tone="neutral" dot>
            {administrators.length - activeCount} disabled
          </Badge>
        ) : null}
      </div>

      {query.isLoading ? (
        <TableSkeleton rows={4} columns={5} />
      ) : query.isError ? (
        <div className="card p-8 text-center">
          <p className="text-sm font-semibold text-navy-900">Administrators could not be loaded</p>
          <p className="mt-1 text-xs text-muted">
            {query.error instanceof ApiError ? query.error.message : 'Check the API connection.'}
          </p>
          <Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : administrators.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="No administrators listed"
          description="This should not normally happen. Check the server diagnostics."
        />
      ) : (
        <div className="space-y-3">
          {administrators.map((admin) => {
            const isSelf = admin.id === currentId;
            return (
              <article
                key={admin.id}
                className={cn('card p-4 sm:p-5', !admin.isActive && 'bg-mist/60')}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <Avatar name={admin.displayName} size="md" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold text-navy-900">{admin.displayName}</h2>
                        {isSelf ? (
                          <Badge tone="accent" dot>
                            You
                          </Badge>
                        ) : null}
                        <Badge tone={roleTone[admin.role]}>{ROLE_LABELS[admin.role]}</Badge>
                        {!admin.isActive ? <Badge tone="danger">Disabled</Badge> : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted">{admin.email}</p>
                      <p className="mt-1.5 text-2xs text-muted">
                        Last sign-in {admin.lastLoginAt ? formatDateTime(admin.lastLoginAt) : 'never'} · joined{' '}
                        {formatDateTime(admin.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button variant="subtle" size="sm" onClick={() => setEditing(admin)}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isSelf}
                      title={isSelf ? 'Use Change password for your own account' : undefined}
                      onClick={() => setResetting(admin)}
                    >
                      <KeyRound className="h-3.5 w-3.5" aria-hidden />
                      Reset password
                    </Button>
                  </div>
                </div>
                <p className="mt-3 border-t border-line pt-3 text-2xs leading-relaxed text-muted">
                  {roleHints[admin.role]}
                </p>
              </article>
            );
          })}
        </div>
      )}

      <div className="card flex items-start gap-3 p-4 text-xs leading-relaxed text-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-600" aria-hidden />
        <p>
          Passwords are hashed with Argon2id and never stored or displayed in plain text. The last active Super
          Admin cannot be disabled or demoted, and you cannot change your own role or deactivate yourself.
        </p>
      </div>

      <Modal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Add administrator"
        description="The new administrator signs in with this email and temporary password. Share it through a secure channel."
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate()} isLoading={createMutation.isPending}>
              Create account
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {createError ? (
            <p role="alert" className="rounded-lg border border-danger-100 bg-danger-50 p-3 text-xs font-medium text-danger-700">
              {createError}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Display name</span>
              <input
                className="input"
                value={createForm.displayName}
                maxLength={80}
                onChange={(event) => setCreateForm((current) => ({ ...current, displayName: event.target.value }))}
              />
            </label>
            <label className="block">
              <span className="field-label">Email</span>
              <input
                type="email"
                className="input"
                value={createForm.email}
                maxLength={254}
                autoComplete="off"
                onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
              />
            </label>
          </div>
          <label className="block">
            <span className="field-label">Role</span>
            <select
              className="select"
              value={createForm.role}
              onChange={(event) => setCreateForm((current) => ({ ...current, role: event.target.value as Role }))}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            <span className="field-hint">{roleHints[createForm.role]}</span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Temporary password</span>
              <input
                type="password"
                className="input"
                value={createForm.password}
                minLength={12}
                autoComplete="new-password"
                onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
              />
              <span className="field-hint">At least 12 characters.</span>
            </label>
            <label className="block">
              <span className="field-label">Confirm password</span>
              <input
                type="password"
                className="input"
                value={createForm.confirm}
                autoComplete="new-password"
                onChange={(event) => setCreateForm((current) => ({ ...current, confirm: event.target.value }))}
              />
            </label>
          </div>
          <p className="rounded-lg bg-navy-900/[0.03] p-3 text-2xs leading-relaxed text-muted">
            The password is hashed on the server. It is never written to the audit log, browser storage or
            application logs.
          </p>
        </div>
      </Modal>

      <Modal
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        title="Edit administrator"
        description={editing ? editing.email : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={editMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={() => editMutation.mutate()} isLoading={editMutation.isPending}>
              Save changes
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            {editError ? (
              <p role="alert" className="rounded-lg border border-danger-100 bg-danger-50 p-3 text-xs font-medium text-danger-700">
                {editError}
              </p>
            ) : null}
            <label className="block">
              <span className="field-label">Display name</span>
              <input
                className="input"
                value={editForm.displayName}
                maxLength={80}
                onChange={(event) => setEditForm((current) => ({ ...current, displayName: event.target.value }))}
              />
            </label>
            <label className="block">
              <span className="field-label">Role</span>
              <select
                className="select"
                value={editForm.role}
                disabled={editing.id === currentId}
                onChange={(event) => setEditForm((current) => ({ ...current, role: event.target.value as Role }))}
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
              <span className="field-hint">{roleHints[editForm.role]}</span>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-line p-3.5">
              <input
                type="checkbox"
                className="checkbox mt-0.5"
                checked={editForm.isActive}
                disabled={editing.id === currentId}
                onChange={(event) => setEditForm((current) => ({ ...current, isActive: event.target.checked }))}
              />
              <span>
                <span className="block text-xs font-semibold text-navy-900">Account active</span>
                <span className="mt-0.5 block text-2xs leading-relaxed text-muted">
                  Disabling revokes all sessions immediately. {editing.id === currentId ? 'You cannot disable your own account.' : ''}
                </span>
              </span>
            </label>
            {editing.role === 'super_admin' && editForm.role !== 'super_admin' ? (
              <p className="inline-flex items-start gap-2 rounded-lg bg-warning-50 p-3 text-2xs leading-relaxed text-warning-700">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Demoting a Super Admin removes access to system, administrators and audit settings immediately.
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={resetting !== null}
        onOpenChange={(open) => {
          if (!open) setResetting(null);
        }}
        title="Reset password"
        description={
          resetting
            ? `Set a new password for ${resetting.displayName}. All their sessions will be signed out.`
            : undefined
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setResetting(null)} disabled={resetMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={() => resetMutation.mutate()} isLoading={resetMutation.isPending}>
              Reset password
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {resetError ? (
            <p role="alert" className="rounded-lg border border-danger-100 bg-danger-50 p-3 text-xs font-medium text-danger-700">
              {resetError}
            </p>
          ) : null}
          <label className="block">
            <span className="field-label">New password</span>
            <input
              type="password"
              className="input"
              value={newPassword}
              minLength={12}
              autoComplete="new-password"
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <span className="field-hint">At least 12 characters. Share it through a secure channel.</span>
          </label>
          <label className="block">
            <span className="field-label">Confirm new password</span>
            <input
              type="password"
              className="input"
              value={confirmPassword}
              autoComplete="new-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}
