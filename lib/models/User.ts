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
  VMOD = "VMod",
  POWERTRAIN = "Powertrain",
  TRACKSIDE_ENGINEERING = "Trackside Engineering",
  OPS = "Operations",
}

export enum SolarSystem {
  AERODYNAMICS = "Aerodynamics",
  COMPOSITES = "Composites",
  DYNAMICS = "Dynamics",
  ERGONOMICS = "Ergonomics",
  POWER_SYSTEMS = "Power Systems",
  VEHICLE_CONTROLS_AND_TELEMETRY = "Vehicle Controls and Telemetry",
  TRACKSIM = "TrackSim",
  OPS = "Operations",
}

export enum CombustionSystem {
  AERODYNAMICS = "Aerodynamics",
  BODY = "Body",
  COMPOSITES = "Composites",
  DYNAMICS = "Dynamics",
  ELECTRONICS = "Electronics",
  POWERTRAIN = "Powertrain",
  SIM_VAL = "Sim/Val",
  OPS = "Operations",
  MANUFACTURING = "Manufacturing",
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

