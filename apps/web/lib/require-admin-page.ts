import { getActorContext, Permission, type PermissionCode } from "@nozi/auth";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";

export async function requireAdminPageActor(permission?: PermissionCode) {
  const actor = await getActorContext(await headers());
  if (!actor) redirect("/sign-in?callbackUrl=/admin");
  if (!actor.permissions.has(Permission.AdminAccess)) forbidden();
  if (permission && !actor.permissions.has(permission)) forbidden();
  return actor;
}
