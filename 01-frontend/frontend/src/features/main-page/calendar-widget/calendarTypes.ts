import { type DeadlineResponse } from '@/api-clients/backend';

/** A deadline enriched with the owning project's display name. */
export type CalendarEvent = DeadlineResponse & { projectName: string };
