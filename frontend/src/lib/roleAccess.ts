/**
 * Role-Based Access Control — defines what each user role can see.
 *
 * Sections map to the sidebar section titles (lowercased).
 * hidePages lists route paths that should be blocked for the role.
 */

export interface RoleConfig {
  sections: string[] | "*";
  hidePages?: string[];
}

export const ROLE_ACCESS: Record<string, RoleConfig> = {
  superadmin: { sections: "*" },
  mso_admin: { sections: "*" },
  analyst: {
    sections: [
      "overview",
      "revenue",
      "cost",
      "quality",
      "network",
      "intelligence",
      "finance",
      "data",
      "population",
      "care ops",
      "operations",
      // "admin" excluded — analyst cannot access admin section
    ],
    hidePages: ["/clinical"],
  },
  provider: {
    sections: ["clinical", "overview"],
    hidePages: [
      "/financial",
      "/risk-accounting",
      "/practice-costs",
      "/scenarios",
      "/roi-tracker",
    ],
  },
  care_manager: {
    sections: ["clinical", "overview", "population", "quality", "care ops", "operations"],
    hidePages: [
      "/financial",
      "/risk-accounting",
      "/practice-costs",
      "/expenditure",
      "/roi-tracker",
    ],
  },
  outreach: {
    sections: ["population", "quality", "overview"],
    hidePages: [
      "/financial",
      "/risk-accounting",
      "/practice-costs",
      "/expenditure",
      "/roi-tracker",
      "/clinical",
    ],
  },
  auditor: {
    sections: ["quality", "data", "finance"],
    hidePages: ["/clinical", "/alerts", "/watchlist"],
  },
  financial: {
    sections: ["finance", "cost", "overview", "operations"],
    hidePages: [
      "/clinical",
      "/members",
      "/journey",
      "/care-gaps",
    ],
  },
} as const;

/** All available roles for the demo role-switcher. */
export const ALL_ROLES = Object.keys(ROLE_ACCESS);

/** Role display labels for the UI. */
export const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super Admin",
  mso_admin: "MSO Admin",
  analyst: "Analyst",
  provider: "Provider",
  care_manager: "Care Manager",
  outreach: "Outreach",
  auditor: "Auditor",
  financial: "Financial",
};

/**
 * Check whether a role can see a given sidebar section.
 *
 * @param role   The user's role string (e.g. "provider").
 * @param section  The section title, lowercased (e.g. "clinical").
 */
export function canAccessSection(role: string, section: string): boolean {
  const config = ROLE_ACCESS[role];
  if (!config) return false; // unknown roles are denied access (secure default)
  if (config.sections === "*") return true;
  return config.sections.includes(section.toLowerCase());
}

/**
 * Check whether a role can access a given page path.
 *
 * @param role  The user's role string.
 * @param path  The route path (e.g. "/financial").
 */
export function canAccessPage(role: string, path: string): boolean {
  const config = ROLE_ACCESS[role];
  if (!config) return false; // unknown roles are denied access (secure default)
  if (!config.hidePages) return true;
  // Normalise path — strip trailing slash, compare prefix
  const normalised = path.replace(/\/+$/, "") || "/";
  return !config.hidePages.some(
    (hidden) =>
      normalised === hidden || normalised.startsWith(hidden + "/"),
  );
}
