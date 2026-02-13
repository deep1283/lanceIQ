import { checkPlanEntitlements } from '@/app/actions/subscription';

export const TEAM_PLAN_REQUIRED_MESSAGE = 'Team plan required for this endpoint.';

export function teamPlanForbiddenBody() {
  return { error: TEAM_PLAN_REQUIRED_MESSAGE };
}

type EntitlementResult = Awaited<ReturnType<typeof checkPlanEntitlements>>;
type EntitlementPredicate = (entitlements: EntitlementResult) => boolean;

export async function hasWorkspaceEntitlement(
  workspaceId: string,
  predicate?: EntitlementPredicate
): Promise<boolean> {
  const entitlements = await checkPlanEntitlements(workspaceId);
  if (predicate) {
    return predicate(entitlements);
  }
  return Boolean(entitlements.isTeam);
}
