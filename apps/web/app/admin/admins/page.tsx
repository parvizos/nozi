import { listAdminUsers, Permission } from "@nozi/auth";

import { AdminUserStatusAction } from "../../../components/admin-user-status-action";
import { requireAdminPageActor } from "../../../lib/require-admin-page";

export default async function AdminUsersPage() {
  const actor = await requireAdminPageActor(Permission.AdminManage);
  const admins = await listAdminUsers(actor);
  return (
    <>
      <h1 className="text-4xl font-semibold">Администраторы</h1>
      <p className="mt-2 text-slate-500">
        Управление доступом требует SUPER_ADMIN, причины и отзыва сессий.
      </p>
      <section className="mt-6 divide-y rounded-2xl border bg-white">
        {admins.map((admin) => {
          const roles = admin.roles.map(({ role }) => role.code);
          const protectedAccount =
            roles.includes("SUPER_ADMIN") || admin.id === actor.userId;
          return (
            <article
              className="flex flex-wrap items-center justify-between gap-4 p-5"
              key={admin.id}
            >
              <div>
                <p className="font-bold">{admin.name}</p>
                <p className="text-sm text-slate-500">
                  {admin.email} · {roles.join(", ")} · {admin.status}
                </p>
              </div>
              {!protectedAccount ? (
                <AdminUserStatusAction
                  label={
                    admin.status === "SUSPENDED" ? "Reactivate" : "Suspend"
                  }
                  path={`/api/v1/admin/admins/${admin.id}/status`}
                  status={admin.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED"}
                />
              ) : null}
            </article>
          );
        })}
      </section>
    </>
  );
}
