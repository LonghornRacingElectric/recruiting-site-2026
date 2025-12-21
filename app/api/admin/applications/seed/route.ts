import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/guard";
import { adminDb } from "@/lib/firebase/admin";
import { ApplicationStatus } from "@/lib/models/Application";
import { Team, ElectricSystem, SolarSystem, CombustionSystem } from "@/lib/models/User";
import { FieldValue } from "firebase-admin/firestore";

const APPLICATIONS_COLLECTION = "applications";
const USERS_COLLECTION = "users";

// First and last names for generating fake applicants
const FIRST_NAMES = [
  "James", "Emma", "Liam", "Olivia", "Noah", "Ava", "William", "Sophia", "Oliver", "Isabella",
  "Elijah", "Mia", "Lucas", "Charlotte", "Mason", "Amelia", "Ethan", "Harper", "Alexander", "Evelyn",
  "Daniel", "Abigail", "Matthew", "Emily", "Aiden", "Elizabeth", "Henry", "Sofia", "Joseph", "Avery",
  "Sebastian", "Ella", "Jack", "Scarlett", "Owen", "Grace", "Samuel", "Chloe", "Ryan", "Victoria",
  "Nathan", "Riley", "Leo", "Aria", "Isaac", "Lily", "Dylan", "Aubrey", "Jacob", "Zoey"
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
  "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
  "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson",
  "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
  "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell", "Carter", "Roberts"
];

const MAJORS = [
  "Electrical Engineering", "Mechanical Engineering", "Computer Science", "Aerospace Engineering",
  "Computer Engineering", "Physics", "Mathematics", "Materials Science", "Chemical Engineering",
  "Industrial Engineering", "Civil Engineering", "Biomedical Engineering"
];

const GRADUATION_YEARS = ["2025", "2026", "2027", "2028", "2029"];

const WHY_JOIN_RESPONSES = [
  "I've always been passionate about racing and engineering. This is the perfect opportunity to combine both.",
  "I want hands-on experience working on real vehicles and being part of a competitive team.",
  "The chance to work with cutting-edge technology and learn from experienced team members excites me.",
  "I believe this experience will help me grow as an engineer and prepare me for my future career.",
  "Racing has been my dream since childhood, and I want to contribute to a winning team.",
  "I'm looking for challenging projects outside the classroom where I can apply what I've learned.",
  "The collaborative environment and competition aspect really appeal to me.",
  "I want to develop practical skills that I can't get from coursework alone.",
];

const EXPERIENCE_RESPONSES = [
  "Built several robotics projects in high school and participated in FIRST Robotics.",
  "Completed internship at an automotive company working on powertrain systems.",
  "Extensive experience with CAD software including SolidWorks and Fusion 360.",
  "Built custom electronics projects including Arduino-based systems and PCB design.",
  "Worked on personal EV conversion project for a vintage sports car.",
  "Completed coursework in dynamics, thermodynamics, and control systems.",
  "Team lead for senior design project involving autonomous vehicle systems.",
  "Self-taught programmer with experience in Python, C++, and embedded systems.",
];

const AVAILABILITY_RESPONSES = [
  "10-15 hours per week, flexible schedule",
  "Available MWF afternoons and most weekends",
  "15-20 hours per week, mainly evenings",
  "Full availability on weekends, limited weekday availability",
  "Can commit 20+ hours during competition season",
  "Available most days after 4pm, entire weekends",
];

function getRandomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomSubset<T>(arr: T[], min: number, max: number): T[] {
  const count = Math.floor(Math.random() * (max - min + 1)) + min;
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function getSystemsForTeam(team: Team): string[] {
  switch (team) {
    case Team.ELECTRIC:
      return Object.values(ElectricSystem);
    case Team.SOLAR:
      return Object.values(SolarSystem);
    case Team.COMBUSTION:
      return Object.values(CombustionSystem);
    default:
      return [];
  }
}

function generateFakeUserId(): string {
  return `fake_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function generateFakeApplication(userId: string, name: string, email: string) {
  const team = getRandomElement(Object.values(Team));
  const systems = getSystemsForTeam(team);
  const preferredSystems = getRandomSubset(systems, 1, Math.min(3, systems.length));
  
  // All fake data starts at 'pending' stage with 'submitted' status
  const status = ApplicationStatus.SUBMITTED;

  // Generate team-specific questions based on team
  const teamQuestions: Record<string, string> = {};
  if (team === Team.ELECTRIC) {
    teamQuestions["electric_skills"] = "Experience with " + getRandomSubset(
      ["PCB design", "embedded systems", "MATLAB", "Python", "C++", "CAD", "simulation"],
      2, 4
    ).join(", ");
    teamQuestions["electric_projects"] = getRandomElement(EXPERIENCE_RESPONSES);
  } else if (team === Team.SOLAR) {
    teamQuestions["solar_interest"] = getRandomElement([
      "Solar array optimization and efficiency",
      "Aerodynamics and drag reduction",
      "Race strategy and energy management",
      "Electrical systems and power electronics"
    ]);
    teamQuestions["solar_experience"] = getRandomElement(EXPERIENCE_RESPONSES);
  } else if (team === Team.COMBUSTION) {
    teamQuestions["combustion_interest"] = getRandomElement([
      "Engine tuning and performance optimization",
      "Chassis design and manufacturing",
      "Suspension geometry and dynamics",
      "Drivetrain and power transmission"
    ]);
    teamQuestions["combustion_experience"] = getRandomElement(EXPERIENCE_RESPONSES);
  }

  const now = new Date();
  const createdAt = new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000); // Within last 30 days

  return {
    userId,
    team,
    preferredSystems,
    status,
    createdAt,
    updatedAt: now,
    submittedAt: createdAt, // All generated apps are submitted
    formData: {
      whyJoin: getRandomElement(WHY_JOIN_RESPONSES),
      relevantExperience: getRandomElement(EXPERIENCE_RESPONSES),
      availability: getRandomElement(AVAILABILITY_RESPONSES),
      graduationYear: getRandomElement(GRADUATION_YEARS),
      major: getRandomElement(MAJORS),
      teamQuestions,
    },
  };
}

export async function POST() {
  try {
    await requireStaff();


    const count = 1000;

    let batch = adminDb.batch();
    let operationsInBatch = 0;
    const createdIds: string[] = [];

    for (let i = 0; i < count; i++) {
      const firstName = getRandomElement(FIRST_NAMES);
      const lastName = getRandomElement(LAST_NAMES);
      const name = `${firstName} ${lastName}`;
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.fake${i}@utexas.edu`;
      const userId = generateFakeUserId();

      // Create fake user document
      const userRef = adminDb.collection(USERS_COLLECTION).doc(userId);
      batch.set(userRef, {
        uid: userId,
        name,
        email,
        role: "applicant",
        blacklisted: false,
        applications: [],
        phoneNumber: null,
        isMember: false,
        isFakeData: true, // Flag for easy cleanup
      });
      operationsInBatch++;

      // Create application
      const application = generateFakeApplication(userId, name, email);
      const appRef = adminDb.collection(APPLICATIONS_COLLECTION).doc();
      batch.set(appRef, {
        ...application,
        id: appRef.id,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        submittedAt: application.submittedAt,
      });
      operationsInBatch++;

      // Update user's applications array
      batch.update(userRef, {
        applications: FieldValue.arrayUnion(appRef.id),
      });
      operationsInBatch++;

      createdIds.push(appRef.id);

      // Commit in batches of 500 (Firestore limit) and create new batch
      if (operationsInBatch >= 498) {
        await batch.commit();
        batch = adminDb.batch();
        operationsInBatch = 0;
      }
    }

    // Commit any remaining
    if (operationsInBatch > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      created: count,
      message: `Created ${count} fake applications with associated user accounts`,
    });
  } catch (error) {
    console.error("Error seeding applications:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to seed applications" },
      { status: 500 }
    );
  }
}

// DELETE endpoint to clean up fake data
export async function DELETE() {
  try {
    await requireStaff();


    // Find and delete all fake users and their applications
    const fakeUsersSnapshot = await adminDb
      .collection(USERS_COLLECTION)
      .where("isFakeData", "==", true)
      .get();

    let deletedUsers = 0;
    let deletedApplications = 0;

    // Delete in batches
    const batchSize = 500;
    let batch = adminDb.batch();
    let operationCount = 0;

    for (const userDoc of fakeUsersSnapshot.docs) {
      const userData = userDoc.data();
      
      // Delete associated applications
      for (const appId of userData.applications || []) {
        const appRef = adminDb.collection(APPLICATIONS_COLLECTION).doc(appId);
        batch.delete(appRef);
        deletedApplications++;
        operationCount++;

        if (operationCount >= batchSize) {
          await batch.commit();
          batch = adminDb.batch();
          operationCount = 0;
        }
      }

      // Delete user
      batch.delete(userDoc.ref);
      deletedUsers++;
      operationCount++;

      if (operationCount >= batchSize) {
        await batch.commit();
        batch = adminDb.batch();
        operationCount = 0;
      }
    }

    // Commit remaining operations
    if (operationCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      deletedUsers,
      deletedApplications,
      message: `Cleaned up ${deletedUsers} fake users and ${deletedApplications} fake applications`,
    });
  } catch (error) {
    console.error("Error cleaning up fake data:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to clean up fake data" },
      { status: 500 }
    );
  }
}
