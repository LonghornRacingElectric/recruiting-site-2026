import { ApplicationQuestion } from "@/lib/models/Config";
import { generateTeamSystemKey } from "@/lib/firebase/utils";
import { ApplicationFormData } from "@/lib/models/Application";

/**
 * Where common-question answers live.
 *
 * Common questions are configured in Firestore (`config/application_questions`),
 * but six of them predate that config and are persisted as *named* fields on
 * `ApplicationFormData`. Every question added through the admin Questions tab
 * gets an auto-generated id (`q_<timestamp>` — see `QuestionsTab.addQuestion`)
 * with no way to edit it, so its id can never match a named field. Those answers
 * used to be dropped silently: the apply form serialized a hardcoded whitelist,
 * so an admin could add a question, watch applicants fill it in, and store
 * nothing. They now go to `formData.customAnswers`, keyed by question id.
 *
 * Gotcha that follows from the above: the live config repurposed the
 * `availability` question — its label is "Phone Number" — because reusing a
 * named field was the only way to add a phone question that actually saved.
 * So `formData.availability` holds phone numbers for anyone who applied after
 * 2026-04-28, and weekly availability is not collected at all. Never label
 * these answers from the field name; always render the label from config.
 */
export const NAMED_COMMON_FIELDS = [
  "whyJoin",
  "relevantExperience",
  "availability",
  "graduationYear",
  "major",
  "resumeUrl",
] as const;

export type NamedCommonField = (typeof NAMED_COMMON_FIELDS)[number];

export function isNamedCommonField(questionId: string): questionId is NamedCommonField {
  return (NAMED_COMMON_FIELDS as readonly string[]).includes(questionId);
}

/**
 * Required answers the applicant has not given, by label, judged against the
 * live question config: the resume (always), every required common and team
 * question, required system questions for the systems actually ranked, and
 * at least one ranked system. Mirrors the form's own Submit check — this is
 * the server-side backstop (#127).
 */
export function missingRequiredAnswers(
  formData: Partial<ApplicationFormData> | undefined,
  preferredSystems: string[],
  team: string,
  questions: {
    commonQuestions: ApplicationQuestion[];
    teamQuestions: Record<string, ApplicationQuestion[]>;
    systemQuestions?: Record<string, ApplicationQuestion[]>;
  }
): string[] {
  const missing: string[] = [];
  const blank = (v: unknown) => typeof v !== "string" || v.trim() === "";
  if (blank(formData?.resumeUrl)) missing.push("Resume");
  for (const q of questions.commonQuestions) {
    if (q.required && blank(getCommonAnswer(formData, q.id))) missing.push(q.label);
  }
  for (const q of questions.teamQuestions[team] ?? []) {
    if (q.required && blank(formData?.teamQuestions?.[q.id])) missing.push(q.label);
  }
  for (const system of preferredSystems) {
    const key = generateTeamSystemKey(team, system);
    const qs = questions.systemQuestions?.[key] ?? questions.systemQuestions?.[system] ?? [];
    for (const q of qs) {
      if (q.required && blank(formData?.customAnswers?.[q.id])) missing.push(`${q.label} (${system})`);
    }
  }
  if (preferredSystems.length === 0) missing.push("Preferred Systems (at least one)");
  return missing;
}

/**
 * Read a common question's answer without caring where it is stored.
 * Returns "" when unanswered.
 */
export function getCommonAnswer(
  formData: Partial<ApplicationFormData> | undefined,
  questionId: string
): string {
  if (!formData) return "";
  if (isNamedCommonField(questionId)) {
    return (formData[questionId] as string) || "";
  }
  return formData.customAnswers?.[questionId] || "";
}

/**
 * Sanitize a client-supplied formData payload down to the fields we actually
 * model. `PATCH /api/applications/[id]` used to merge whatever object it was
 * handed, and live data accumulated junk keys (`__internal_override`, `role`,
 * `"  spaces  "`, …) from someone poking the API. Named fields must be strings;
 * the two answer bags keep only string values.
 */
// Hard caps (#74), far above anything the form allows (word limits top out
// around 3,500 characters; URLs are shorter still): an applicant cannot grow
// their document toward Firestore's 1 MB limit over successive autosaves.
export const MAX_ANSWER_CHARS = 20_000;
export const MAX_BAG_ENTRIES = 100;
export const MAX_QUESTION_ID_CHARS = 64;

export function sanitizeIncomingFormData(
  input: unknown
): Partial<ApplicationFormData> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const raw = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const clip = (v: string) => (v.length > MAX_ANSWER_CHARS ? v.slice(0, MAX_ANSWER_CHARS) : v);
  const NAMED_WRITABLE = [...NAMED_COMMON_FIELDS, "portfolioUrl"] as const;
  for (const field of NAMED_WRITABLE) {
    if (typeof raw[field] === "string") out[field] = clip(raw[field] as string);
  }
  for (const bag of ["teamQuestions", "customAnswers"] as const) {
    const value = raw[bag];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[bag] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([k, v]) => typeof v === "string" && k.length <= MAX_QUESTION_ID_CHARS)
          .slice(0, MAX_BAG_ENTRIES)
          .map(([k, v]) => [k, clip(v as string)])
      );
    }
  }
  return out as Partial<ApplicationFormData>;
}

/**
 * Common questions that are rendered somewhere other than the answer list:
 * major and graduation year appear in the applicant header, the resume has its
 * own viewer tab. Skip these when listing answers so they aren't shown twice.
 */
export const COMMON_FIELDS_SHOWN_ELSEWHERE: readonly string[] = [
  "graduationYear",
  "major",
  "resumeUrl",
];
