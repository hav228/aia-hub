// The two ministries that share this app. Each has its own data, leader list and settings.
// AIA's data lives at the top level of the database (where it started); Cru's lives under orgs/cru/.
export const ORGS = {
  aia: {
    key: 'aia', short: 'AIA', name: 'AIA Lehigh', full: 'Athletes in Action', prefix: '',
    day: 0, dayName: 'Sunday', plansTitle: 'Sunday Studies', plansNav: 'Studies', noMeeting: 'No study',
    hasTeams: true, staffLabel: 'AIA staff',
  },
  cru: {
    key: 'cru', short: 'Cru', name: 'Cru Lehigh', full: 'Cru', prefix: 'orgs/cru/',
    day: 4, dayName: 'Thursday', plansTitle: 'Thursday Night Plans', plansNav: 'Plans', noMeeting: 'No meeting',
    hasTeams: false, staffLabel: 'Cru staff',
  },
};
export let ORG = ORGS.aia;
export function useOrg(key) { ORG = ORGS[key] || ORGS.aia; return ORG; }
export const orgFromKey = k => ORGS[k] || ORGS.aia;
