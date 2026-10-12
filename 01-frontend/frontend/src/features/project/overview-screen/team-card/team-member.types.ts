import type { Relation } from '@/api-clients/backend';

export type TeamMemberRole = Extract<Relation, 'owner' | 'member'>;

export type TeamMember = {
  id: string;
  name: string;
  role: TeamMemberRole;
};
