import { google, calendar_v3 } from "googleapis";
import { adminDb } from "@/lib/firebase/admin";
import { InterviewSlotConfig, AvailableSlot } from "@/lib/models/Interview";
import { FieldValue } from "firebase-admin/firestore";
import { format } from "date-fns-tz";

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
 * Query the Google Calendar API to get available time slots for scheduling.
 * Supports multiple concurrent interviews if configured.
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
  const events: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;

  // Fetch all events for the calendar within the date range, handling pagination
  do {
    const eventsResponse = await calendar.events.list({
      calendarId: config.calendarId,
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true, // Expand recurring events
      orderBy: "startTime",
      timeZone: config.timezone || "America/Chicago",
      pageToken,
    });

    if (eventsResponse.data.items) {
      events.push(...eventsResponse.data.items);
    }

    pageToken = eventsResponse.data.nextPageToken || undefined;
  } while (pageToken);

  // Generate all possible slots within the date range
  const allSlots = generatePossibleSlots(config, startDate, endDate);

  // Filter slots based on concurrency limit
  const maxConcurrency = config.maxConcurrentInterviews ?? 1;

  // If we only allow 1 interview, we can optimize by just checking if *any* event overlaps
  // But for consistency and simplicity, we'll use the general counting logic.

  // Note: This logic assumes that the fetched events are the only things blocking the slot.
  // If 'interviewerEmails' also have their own busy calendars, we are currently ignoring that
  // per requirements (we invite them regardless).

  return filterAvailableSlots(allSlots, events, maxConcurrency, config.timezone || "America/Chicago");
}

/**
 * Helper to filter slots based on overlapping events and concurrency limit.
 * Exported for testing.
 */
export function filterAvailableSlots(
  possibleSlots: AvailableSlot[],
  events: calendar_v3.Schema$Event[],
  maxConcurrency: number,
  timezone: string
): AvailableSlot[] {
  return possibleSlots.filter((slot) => {
    const slotStart = slot.start.getTime();
    const slotEnd = slot.end.getTime();

    // Count how many events overlap with this slot
    const overlappingCount = events.reduce((count, event) => {
      // Ignore events marked as transparent (Free) or cancelled
      if (event.transparency === "transparent" || event.status === "cancelled") {
        return count;
      }

      if (event.start?.dateTime && event.end?.dateTime) {
        // Timed event
        const eventStart = new Date(event.start.dateTime).getTime();
        const eventEnd = new Date(event.end.dateTime).getTime();

        // Check for overlap
        // Overlap exists if (SlotStart < EventEnd) AND (SlotEnd > EventStart)
        if (slotStart < eventEnd && slotEnd > eventStart) {
          return count + 1;
        }
      } else if (event.start?.date && event.end?.date) {
        // All-day event
        // We convert the slot time to the calendar's timezone YYYY-MM-DD
        // to check if it falls within the all-day event's range.
        const slotDateStr = format(slot.start, 'yyyy-MM-dd', { timeZone: timezone });

        // All-day event range: start.date (inclusive) to end.date (exclusive)
        // e.g. Start 2024-01-01, End 2024-01-02 covers 2024-01-01
        if (slotDateStr >= event.start.date && slotDateStr < event.end.date) {
           return count + 1;
        }
      }

      return count;
    }, 0);

    return overlappingCount < maxConcurrency;
  });
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
  const slotDuration = config.durationMinutes * 60 * 1000; // Convert to milliseconds
  const bufferDuration = config.bufferMinutes * 60 * 1000;
  const totalSlotTime = slotDuration + bufferDuration;

  // Clone start date to iterate
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);

  while (current < endDate) {
    const dayOfWeek = current.getDay();

    // Check if this day is available
    if (config.availableDays.includes(dayOfWeek)) {
      // Generate slots for this day
      const dayStart = new Date(current);
      dayStart.setHours(config.availableStartHour, 0, 0, 0);

      const dayEnd = new Date(current);
      dayEnd.setHours(config.availableEndHour, 0, 0, 0);

      let slotStart = new Date(dayStart);

      while (slotStart.getTime() + slotDuration <= dayEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + slotDuration);

        // Only include slots that are in the future and within the query range
        if (slotStart >= startDate && slotEnd <= endDate && slotStart > new Date()) {
          slots.push({
            start: new Date(slotStart),
            end: new Date(slotEnd),
          });
        }

        // Move to next slot (with buffer)
        slotStart = new Date(slotStart.getTime() + totalSlotTime);
      }
    }

    // Move to next day
    current.setDate(current.getDate() + 1);
  }

  return slots;
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
 * @returns The created event ID
 */
export async function createInterviewEvent(
  config: InterviewSlotConfig,
  system: string,
  applicantEmail: string,
  applicantName: string,
  slotStart: Date,
  slotEnd: Date
): Promise<string> {
  const calendar = await getCalendarClient();

  const attendees = [
    { email: applicantEmail },
    ...config.interviewerEmails.map((email) => ({ email })),
  ];

  const teamName = config.team || "Team";
  const systemName = system || config.system || "System";

  const event: calendar_v3.Schema$Event = {
    summary: `Interview: ${applicantName} - ${teamName} ${systemName}`,
    description: `Interview for ${teamName} team, ${systemName} system.\n\nApplicant: ${applicantName} (${applicantEmail})`,
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
