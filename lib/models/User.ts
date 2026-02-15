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
  AERODYNAMICS = "Aerodynamics",
  BODY = "Body",
  DYNAMICS = "Dynamics",
  ELECTRONICS = "Electronics",
  POWERTRAIN = "Powertrain",
  VEHICLE_MODELING = "Vehicle Modeling",
  OPS = "Operations", // Corporate Relations, PR, Sustainability, Treasury
  // TRACKSIDE_ENGINEERING = "Trackside Engineering",
}

export enum SolarSystem {
  AERODYNAMICS = "Aerodynamics",
  COMPOSITES = "Composites",
  POWERTRAIN = "Powertrain",
  BODY = "Body",
  DYNAMICS = "Dynamics",
  VEHICLE_CONTROLS_AND_TELEMETRY = "Vehicle Controls and Telemetry",
  POWER_SYSTEMS = "Power Systems",
  POWER_GENERATION = "Power Generation",
  OPS = "Operations", // Corporate Relations, Public Relations, Treasury
}

export enum CombustionSystem {
  AERODYNAMICS = "Aerodynamics",
  BODY = "Body",
  COMPOSITES = "Composites",
  DYNAMICS = "Dynamics",
  ELECTRONICS = "Electronics",
  POWERTRAIN = "Powertrain",
  SIM_AI = "Sim/AI",
  OPS = "Operations", // Corporate Relations, Public Relations, Treasury
}

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

