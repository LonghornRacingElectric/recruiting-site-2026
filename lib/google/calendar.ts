import { google, calendar_v3 } from "googleapis";
import { adminDb } from "@/lib/firebase/admin";
import { InterviewSlotConfig, AvailableSlot } from "@/lib/models/Interview";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Google Calendar Service for interview scheduling.
 * Uses OAuth2 with tokens stored in Firestore for authentication.
 * Implements atomic token refresh to prevent race conditions.
 */

const TOKENS_COLLECTION = "tokens";
const GOOGLE_CALENDAR_DOC = "google_calendar";

interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expiry: number; // Unix timestamp in milliseconds
}

/**
 * Get OAuth2 client with valid access token.
 * Handles token refresh atomically using Firestore transactions.
 */
async function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing Google OAuth2 credentials. " +
        "Please set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET environment variables."
    );
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);

  // Get tokens from Firestore with atomic refresh if needed
  const tokens = await getValidTokens(oauth2Client);
  
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });

  return oauth2Client;
}

/**
 * Get valid tokens from Firestore, refreshing atomically if expired.
 * Uses Firestore transaction to prevent race conditions when multiple
 * Lambda functions try to refresh simultaneously.
 */
async function getValidTokens(
  oauth2Client: InstanceType<typeof google.auth.OAuth2>
): Promise<StoredTokens> {
  const tokenRef = adminDb.collection(TOKENS_COLLECTION).doc(GOOGLE_CALENDAR_DOC);

  return await adminDb.runTransaction(async (transaction) => {
    const doc = await transaction.get(tokenRef);

    if (!doc.exists) {
      throw new Error(
        "Google Calendar tokens not found in Firestore. " +
          "Please add tokens to tokens/google_calendar collection."
      );
    }

    const tokens = doc.data() as StoredTokens;
    const now = Date.now();
    
    // Check if token is expired or will expire within 5 minutes
    const expiryBuffer = 5 * 60 * 1000; // 5 minutes
    const isExpired = tokens.expiry - now < expiryBuffer;

    if (!isExpired) {
      // Token is still valid
      return tokens;
    }

    // Token is expired or expiring soon - refresh it
    console.log("Refreshing Google Calendar access token...");

    oauth2Client.setCredentials({
      refresh_token: tokens.refresh_token,
    });

    try {
      const { credentials } = await oauth2Client.refreshAccessToken();

      if (!credentials.access_token) {
        throw new Error("Failed to refresh access token - no token returned");
      }

      const newTokens: StoredTokens = {
        access_token: credentials.access_token,
        refresh_token: credentials.refresh_token || tokens.refresh_token,
        expiry: credentials.expiry_date || (now + 3600 * 1000), // Default 1 hour
      };

      // Update tokens in Firestore atomically within the transaction
      transaction.update(tokenRef, {
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        expiry: newTokens.expiry,
        updatedAt: FieldValue.serverTimestamp(),
      });

      console.log("Successfully refreshed Google Calendar access token");
      return newTokens;
    } catch (error) {
      console.error("Failed to refresh access token:", error);
      throw new Error(
        "Failed to refresh Google Calendar access token. " +
          "The refresh token may be invalid or revoked."
      );
    }
  });
}

/**
 * Get an authenticated Google Calendar client
 */
export async function getCalendarClient(): Promise<calendar_v3.Calendar> {
  const auth = await getOAuth2Client();
  return google.calendar({ version: "v3", auth });
}

/**
 * Query the FreeBusy API to get available time slots for scheduling.
 * Also filters out slots that are currently locked by other applicants.
 *
 * @param config - Interview slot configuration with calendar and time constraints
 * @param startDate - Start of the date range to check
 * @param endDate - End of the date range to check
 * @returns Array of available time slots
 */
export async function getAvailableSlots(
  config: InterviewSlotConfig,
  startDate: Date,
  endDate: Date
): Promise<AvailableSlot[]> {
  const calendar = await getCalendarClient();

  // Query free/busy information for the calendar
  const freeBusyResponse = await calendar.freebusy.query({
    requestBody: {
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      timeZone: config.timezone || "America/Chicago",
      items: [{ id: config.calendarId }],
    },
  });

  const busySlots =
    freeBusyResponse.data.calendars?.[config.calendarId]?.busy || [];

  // Generate all possible slots within the date range
  const allSlots = generatePossibleSlots(config, startDate, endDate);

  // Query Firestore for locked slots on this calendar within the date range
  const lockedSlotsSnapshot = await adminDb
    .collection("calendarSlotLocks")
    .where("calendarId", "==", config.calendarId)
    .where("slotStart", ">=", startDate)
    .where("slotStart", "<=", endDate)
    .get();

  const lockedSlotTimes = new Set(
    lockedSlotsSnapshot.docs.map((doc) => {
      const data = doc.data();
      const slotStart = data.slotStart instanceof Date 
        ? data.slotStart 
        : data.slotStart?.toDate?.() || new Date(data.slotStart);
      return slotStart.getTime();
    })
  );

  // Filter out busy slots AND locked slots
  const availableSlots = allSlots.filter((slot) => {
    // Check if slot is locked in Firestore
    if (lockedSlotTimes.has(slot.start.getTime())) {
      return false;
    }

    // Check if slot overlaps with Google Calendar busy times
    return !busySlots.some((busy) => {
      const busyStart = new Date(busy.start!);
      const busyEnd = new Date(busy.end!);
      // Check for overlap
      return slot.start < busyEnd && slot.end > busyStart;
    });
  });

  return availableSlots;
}

/**
 * Generate all possible time slots based on configuration.
 */
function generatePossibleSlots(
  config: InterviewSlotConfig,
  startDate: Date,
  endDate: Date
): AvailableSlot[] {
  const slots: AvailableSlot[] = [];
  const timezone = config.timezone || "America/Chicago";
  
  // Helper to get offset string (e.g. "-05:00") for a specific date in a timezone
  const getOffset = (date: Date) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset'
    }).formatToParts(date);
    const offsetStr = parts.find(p => p.type === 'timeZoneName')!.value; // e.g. "GMT-5" or "GMT+10:30"
    
    if (offsetStr === 'GMT') return '+00:00';
    
    const match = offsetStr.match(/GMT([+-])(\d+)(?::(\d+))?/);
    if (!match) return '+00:00';
    
    const [_, sign, hours, mins = '00'] = match;
    return `${sign}${hours.padStart(2, '0')}:${mins.padStart(2, '0')}`;
  };

  // Helper to create a Date object for a specific YYYY-MM-DD HH:00 in the target timezone
  const createTzDate = (date: Date, hour: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(date);
    
    const year = parts.find(p => p.type === 'year')!.value;
    const month = parts.find(p => p.type === 'month')!.value.padStart(2, '0');
    const day = parts.find(p => p.type === 'day')!.value.padStart(2, '0');
    const hourStr = String(hour).padStart(2, '0');
    
    // First, create a temporary date to find the offset on that day
    const isoNoOffset = `${year}-${month}-${day}T${hourStr}:00:00`;
    const tempDate = new Date(`${isoNoOffset}Z`); // Treat as UTC just to get a valid Date object
    const offset = getOffset(tempDate);
    
    return new Date(`${isoNoOffset}${offset}`);
  };

  const dayMillis = 24 * 60 * 60 * 1000;
  // Start checking from 1 day before startDate to ensure we don't miss anything due to TZ diffs
  let currentDay = new Date(startDate.getTime() - dayMillis);

  // Map for weekday short names to numeric
  const daysMap: Record<string, number> = {
    'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
  };

  // Iterate for 21 days (covers the 14-day range + buffers)
  for (let d = 0; d < 21; d++) {
    const checkDate = new Date(currentDay.getTime() + (d * dayMillis));
    
    // Correctly get weekday in target timezone
    const weekdayShort = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short'
    }).format(checkDate);
    
    const dayOfWeek = daysMap[weekdayShort];

    if (config.availableDays.includes(dayOfWeek)) {
      const dayStart = createTzDate(checkDate, config.availableStartHour);
      const dayEnd = createTzDate(checkDate, config.availableEndHour);
      
      const slotDuration = config.durationMinutes * 60 * 1000;
      const bufferDuration = config.bufferMinutes * 60 * 1000;
      const totalSlotTime = slotDuration + bufferDuration;

      let slotStart = new Date(dayStart);
      const now = new Date();

      while (slotStart.getTime() + slotDuration <= dayEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + slotDuration);

        // Filter: must be in requested range, and must be in the future
        if (slotStart >= startDate && slotEnd <= endDate && slotStart > now) {
          slots.push({
            start: new Date(slotStart),
            end: new Date(slotEnd),
          });
        }

        slotStart = new Date(slotStart.getTime() + totalSlotTime);
      }
    }
  }

  // Sort slots by time and remove duplicates (rare but possible with TZ overlap)
  return slots
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .filter((slot, index, self) => 
      index === 0 || slot.start.getTime() !== self[index-1].start.getTime()
    );
}

/**
 * Create a calendar event for an interview.
 *
 * @param config - Interview slot configuration
 * @param system - The system name (e.g., "Electronics")
 * @param applicantEmail - Email of the applicant
 * @param applicantName - Name of the applicant
 * @param slotStart - Start time of the interview
 * @param slotEnd - End time of the interview
 * @param applicationId - The application ID for the portal link
 * @returns The created event ID
 */
export async function createInterviewEvent(
  config: InterviewSlotConfig,
  system: string,
  applicantEmail: string,
  applicantName: string,
  slotStart: Date,
  slotEnd: Date,
  applicationId?: string
): Promise<string> {
  const calendar = await getCalendarClient();

  const attendees = [
    { email: applicantEmail },
    ...config.interviewerEmails.map((email) => ({ email })),
  ];

  const teamName = config.team || "Team";
  const systemName = system || config.system || "System";

  // Build description with portal link if applicationId is provided
  let description = `Interview for ${teamName} team, ${systemName} system.\n\nApplicant: ${applicantName} (${applicantEmail})`;
  if (applicationId) {
    description += `\n\nView your application portal: https://recruiting.longhornracing.org/dashboard/applications/${applicationId}`;
  }

  const event: calendar_v3.Schema$Event = {
    summary: `Interview: ${applicantName} - ${teamName} ${systemName}`,
    description,
    start: {
      dateTime: slotStart.toISOString(),
      timeZone: config.timezone || "America/Chicago",
    },
    end: {
      dateTime: slotEnd.toISOString(),
      timeZone: config.timezone || "America/Chicago",
    },
    attendees,
    conferenceData: {
      createRequest: {
        requestId: `interview-${Date.now()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 24 * 60 }, // 1 day before
        { method: "popup", minutes: 30 }, // 30 minutes before
      ],
    },
    guestsCanSeeOtherGuests: false, // Hide guest list from applicants
  };

  const response = await calendar.events.insert({
    calendarId: config.calendarId,
    requestBody: event,
    conferenceDataVersion: 1,
    sendUpdates: "all", // Send email notifications to attendees
  });

  if (!response.data.id) {
    throw new Error("Failed to create calendar event: No event ID returned");
  }

  return response.data.id;
}

/**
 * Cancel/delete a calendar event.
 *
 * @param calendarId - The calendar ID where the event exists
 * @param eventId - The event ID to cancel
 * @param sendNotifications - Whether to send cancellation notifications
 */
export async function cancelInterviewEvent(
  calendarId: string,
  eventId: string,
  sendNotifications: boolean = true
): Promise<void> {
  const calendar = await getCalendarClient();

  await calendar.events.delete({
    calendarId,
    eventId,
    sendUpdates: sendNotifications ? "all" : "none",
  });
}

/**
 * Get details of a calendar event.
 *
 * @param calendarId - The calendar ID where the event exists
 * @param eventId - The event ID to fetch
 * @returns The event details or null if not found
 */
export async function getInterviewEvent(
  calendarId: string,
  eventId: string
): Promise<calendar_v3.Schema$Event | null> {
  const calendar = await getCalendarClient();

  try {
    const response = await calendar.events.get({
      calendarId,
      eventId,
    });
    return response.data;
  } catch {
    // Event not found or deleted
    return null;
  }
}

/**
 * Update a calendar event (e.g., to reschedule).
 *
 * @param calendarId - The calendar ID where the event exists
 * @param eventId - The event ID to update
 * @param updates - Partial event data to update
 */
export async function updateInterviewEvent(
  calendarId: string,
  eventId: string,
  updates: Partial<calendar_v3.Schema$Event>
): Promise<calendar_v3.Schema$Event> {
  const calendar = await getCalendarClient();

  const response = await calendar.events.patch({
    calendarId,
    eventId,
    requestBody: updates,
    sendUpdates: "all",
  });

  return response.data;
}

/**
 * List all calendars accessible to the service account.
 * Used for populating the calendar selection dropdown.
 */
export async function listAccessibleCalendars(): Promise<{ id: string; summary: string }[]> {
  const calendar = await getCalendarClient();

  const response = await calendar.calendarList.list({
    minAccessRole: "writer", // Ensure we can write to the calendar
  });

  return (
    response.data.items?.map((item) => ({
      id: item.id || "",
      summary: item.summary || "Untitled Calendar",
    })) || []
  );
}
