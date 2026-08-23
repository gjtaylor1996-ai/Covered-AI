// Shapes that don't map cleanly onto Prisma scalars/enums, kept in sync
// with reference/docs/covered-technical-spec.md §1.

export interface DayAvailability {
  enabled: boolean;
  start: string; // "17:00"
  end: string; // "23:00"
}

export interface WeeklyAvailability {
  monday: DayAvailability;
  tuesday: DayAvailability;
  wednesday: DayAvailability;
  thursday: DayAvailability;
  friday: DayAvailability;
  saturday: DayAvailability;
  sunday: DayAvailability;
}

// Prisma enum identifiers can't contain spaces or slashes, so the DB enum
// WorkerRole uses collapsed names. This maps them back to the exact
// display strings from the spec (§1) for anything user-facing.
export const WORKER_ROLE_LABELS = {
  Bartender: "Bartender",
  WaiterWaitress: "Waiter/Waitress",
  HeadChef: "Head Chef",
  SousChef: "Sous Chef",
  ChefDePartie: "Chef de Partie",
  CommisChef: "Commis Chef",
  KitchenPorter: "Kitchen Porter",
  EventSteward: "Event Steward",
  Housekeeper: "Housekeeper",
  Barista: "Barista",
  FrontOfHouseManager: "Front of House Manager",
} as const;

export type WorkerRoleKey = keyof typeof WORKER_ROLE_LABELS;
