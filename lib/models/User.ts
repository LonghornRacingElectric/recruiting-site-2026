export enum UserRole {
  ADMIN = "admin",
  TEAM_CAPTAIN_OB = "team_captain_ob",
  SYSTEM_LEAD = "system_lead",
  APPLICANT = "applicant",
  REVIEWER = "reviewer",
}

export enum Team {
  ELECTRIC = "Electric",
  SOLAR = "Solar",
  COMBUSTION = "Combustion",
}

export enum ElectricSystem {
  ELECTRONICS = "Electronics",
  VEHICLE_MODELING = "Vehicle Modeling",
  POWERTRAIN = "Powertrain",
  DYNAMICS = "Dynamics",

  // TRACKSIDE_ENGINEERING = "Trackside Engineering",
}

export enum SolarSystem {}

export enum CombustionSystem {}

export interface Member {
  team: Team;
  system: ElectricSystem | SolarSystem | CombustionSystem;
}

export interface User {
  name: string;
  role: UserRole;
  blacklisted: boolean;
  applications: string[];
  uid: string;
  email: string;
  phoneNumber: string | null;
  isMember: boolean;
  memberProfile?: Member;
}
