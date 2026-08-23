import type { WorkerRoleKey } from "@/lib/types";

// Match score, spec §2.2:
//   match_score = 0.5*reliability + 0.3*distance_component + 0.2*experience_component
// distance_component needs real lat/lng, which needs a geocoding
// integration (spec §5) that was never built — postcodes are stored as
// free text, not geocoded. Rather than fake a distance, this treats the
// distance term as neutral (its max value, i.e. "no penalty") for every
// candidate, so ranking still reflects the two components that ARE
// real (reliability, experience) rather than being silently wrong.
// Revisit once geocoding lands.
export function computeMatchScore(params: {
  reliabilityScore: number | null;
  yearsExperience: number;
}): number {
  const reliabilityComponent = params.reliabilityScore ?? 50; // "rising" = unproven, not zero
  const distanceComponent = 100; // neutral — see note above
  const experienceComponent = Math.min((params.yearsExperience / 12) * 100, 100);

  return Math.round(0.5 * reliabilityComponent + 0.3 * distanceComponent + 0.2 * experienceComponent);
}

// "Kitchen roles" grouping from the prototype's quick action
// (covered.html, applyQuickAction('kitchen') -> f-role = '__kitchen__').
// Matching the prototype's own grouping rather than inventing one.
export const KITCHEN_ROLES: WorkerRoleKey[] = [
  "HeadChef",
  "SousChef",
  "ChefDePartie",
  "CommisChef",
  "KitchenPorter",
];

export const KITCHEN_ROLE_GROUP = "__kitchen__";
