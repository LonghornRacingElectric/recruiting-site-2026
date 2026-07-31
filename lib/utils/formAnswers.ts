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
 * Common questions that are rendered somewhere other than the answer list:
 * major and graduation year appear in the applicant header, the resume has its
 * own viewer tab. Skip these when listing answers so they aren't shown twice.
 */
export const COMMON_FIELDS_SHOWN_ELSEWHERE: readonly string[] = [
  "graduationYear",
  "major",
  "resumeUrl",
];
