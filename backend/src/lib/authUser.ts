import type { MembershipRole } from "@prisma/client";

export type AuthMembership = {
  teamId: string;
  teamName: string;
  role: MembershipRole;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  memberships: AuthMembership[];
};

export type UserWithMemberships = {
  id: string;
  email: string;
  name: string;
  memberships: {
    role: MembershipRole;
    teamId: string;
    team: { id: string; name: string };
  }[];
};

export function toAuthUser(user: UserWithMemberships): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    memberships: user.memberships
      .map((m) => ({
        teamId: m.team.id,
        teamName: m.team.name,
        role: m.role,
      }))
      .sort((a, b) => a.teamName.localeCompare(b.teamName)),
  };
}

export function publicUser(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    memberships: user.memberships,
  };
}
