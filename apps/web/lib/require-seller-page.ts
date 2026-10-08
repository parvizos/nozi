import { getActorContext } from "@nozi/auth";
import { UserRoleCode } from "@nozi/database";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";

export async function requireSellerPageActor() {
  const actor = await getActorContext(await headers());
  if (!actor) redirect("/sign-in?callbackUrl=/seller");
  if (!actor.roles.has(UserRoleCode.SELLER)) forbidden();
  return actor;
}
