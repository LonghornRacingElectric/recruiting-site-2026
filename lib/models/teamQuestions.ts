import { Team, ElectricSystem, SolarSystem, CombustionSystem } from "./User";

export interface TeamQuestion {
  id: string;
  label: string;
  type: "text" | "textarea" | "select";
  options?: string[];
  required: boolean;
  placeholder?: string;
}

export interface SystemOption {
  value: string;
  label: string;
}

// System options for each team's preferred system dropdown
export const TEAM_SYSTEMS: Record<Team, SystemOption[]> = {
  [Team.ELECTRIC]: Object.values(ElectricSystem).map((sys) => ({
    value: sys,
    label: sys,
  })),
  [Team.SOLAR]: Object.values(SolarSystem).map((sys) => ({
    value: sys,
    label: sys,
  })),
  [Team.COMBUSTION]: Object.values(CombustionSystem).map((sys) => ({
    value: sys,
    label: sys,
  })),
};

// Team-specific questions
export const TEAM_QUESTIONS: Record<Team, TeamQuestion[]> = {
  [Team.ELECTRIC]: [
    {
      id: "electric_skills",
      label: "What relevant electrical/software skills do you have?",
      type: "textarea",
      required: true,
      placeholder:
        "e.g., PCB design, embedded systems, CAD, programming languages...",
    },
    {
      id: "electric_projects",
      label: "Describe any relevant projects you've worked on.",
      type: "textarea",
      required: false,
      placeholder:
        "Personal projects, class projects, internship work, etc...",
    },
  ],
  [Team.SOLAR]: [
    {
      id: "solar_interest",
      label: "What aspect of solar racing interests you most?",
      type: "textarea",
      required: true,
      placeholder: "e.g., solar array design, aerodynamics, race strategy...",
    },
    {
      id: "solar_experience",
      label: "Do you have any experience with renewable energy systems?",
      type: "textarea",
      required: false,
      placeholder: "Describe any relevant projects or coursework...",
    },
  ],
  [Team.COMBUSTION]: [
    {
      id: "combustion_interest",
      label: "What area of the combustion vehicle interests you most?",
      type: "textarea",
      required: true,
      placeholder: "e.g., engine tuning, chassis design, suspension...",
    },
    {
      id: "combustion_experience",
      label: "Do you have any automotive or mechanical experience?",
      type: "textarea",
      required: false,
      placeholder: "e.g., working on cars, machining, welding...",
    },
  ],
};

// Common questions for all applications
export const COMMON_QUESTIONS: TeamQuestion[] = [
  {
    id: "graduationYear",
    label: "Expected Graduation Year",
    type: "select",
    options: ["2025", "2026", "2027", "2028", "2029", "2030"],
    required: true,
  },
  {
    id: "major",
    label: "Major(s)",
    type: "text",
    required: true,
    placeholder: "e.g., Electrical Engineering, Computer Science...",
  },
  {
    id: "whyJoin",
    label: "Why do you want to join Longhorn Racing?",
    type: "textarea",
    required: true,
    placeholder: "Tell us what motivates you to be part of this team...",
  },
  {
    id: "relevantExperience",
    label: "What relevant experience do you have?",
    type: "textarea",
    required: true,
    placeholder:
      "Include coursework, projects, internships, or personal experience...",
  },
  {
    id: "availability",
    label: "What is your weekly availability?",
    type: "textarea",
    required: true,
    placeholder: "e.g., 10-15 hours per week, MWF afternoons...",
  },
];

// Team display info for the team selection page
export interface TeamInfo {
  team: Team;
  name: string;
  description: string;
  color: string;
  icon: string;
}

export const TEAM_INFO: TeamInfo[] = [
  {
    team: Team.ELECTRIC,
    name: "Electric",
    description:
      "Design and build high-performance electric racing vehicles. Work on electronics, powertrain, vehicle modeling, and dynamics systems.",
    color: "#FFB526", // golden yellow
    icon: "⚡",
  },
  {
    team: Team.SOLAR,
    name: "Solar",
    description:
      "Build solar-powered vehicles for cross-country racing. Focus on efficiency, aerodynamics, and renewable energy systems.",
    color: "#FF9404", // bright orange
    icon: "☀️",
  },
  {
    team: Team.COMBUSTION,
    name: "Combustion",
    description:
      "Engineer high-performance internal combustion racing vehicles. Work on engine, chassis, suspension, and drivetrain systems.",
    color: "#FFC871", // pale orange
    icon: "🔥",
  },
];
