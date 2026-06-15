import type { Relation } from '@/api-clients/identity-management-module';

export type TeamMemberRole = Extract<Relation, 'owner' | 'member'>;

export type TeamMember = {
  id: string;
  name: string;
  role: TeamMemberRole;
};
