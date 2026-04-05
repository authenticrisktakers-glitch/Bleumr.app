/**
 * SkillsService — Custom reusable commands for Code Bleu
 *
 * Skills are defined in BLEUMR.md under a ## Skills section:
 *
 *   ## Skills
 *   ### /review-pr
 *   Read the current git diff, analyze code quality, check for bugs,
 *   and provide a structured review with actionable feedback.
 *
 *   ### /test-all
 *   Run `npm test` and if any tests fail, read the failing test files
 *   and fix them. Re-run until all tests pass.
 *
 * When the user types `/review-pr`, the skill prompt replaces their input
 * and flows into the normal agentic loop.
 */

export interface Skill {
  name: string;     // e.g. "review-pr"
  command: string;  // e.g. "/review-pr"
  prompt: string;   // the full expanded prompt
}

/**
 * Parse skills from BLEUMR.md content.
 * Looks for a "## Skills" section with "### /name" sub-headings.
 */
export function parseSkills(bleumrContent: string): Skill[] {
  const skills: Skill[] = [];

  // Find the ## Skills section
  const skillsMatch = bleumrContent.match(/## Skills\s*\n([\s\S]*?)(?=\n## |\n#[^#]|$)/i);
  if (!skillsMatch) return skills;

  const section = skillsMatch[1];

  // Split on ### /name headings
  const parts = section.split(/(?=###\s+\/)/);

  for (const part of parts) {
    const headerMatch = part.match(/^###\s+\/([\w-]+)\s*\n([\s\S]*)/);
    if (!headerMatch) continue;

    const [, name, body] = headerMatch;
    const prompt = body.trim();

    if (prompt.length > 0) {
      skills.push({
        name,
        command: `/${name}`,
        prompt,
      });
    }
  }

  return skills;
}

/**
 * Check if user input is a skill command.
 * @returns the skill name if matched, null otherwise
 */
export function matchSkillCommand(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  // Extract command name (stop at space or end)
  const match = trimmed.match(/^\/([\w-]+)/);
  return match ? match[1] : null;
}

/**
 * Get the expanded prompt for a skill.
 * The prompt is prefixed with context so the model knows it came from a config file.
 * Skill prompts are capped at 2000 chars to limit injection surface.
 */
export function getSkillPrompt(skillName: string, skills: Skill[]): string | null {
  const skill = skills.find(s => s.name === skillName);
  if (!skill) return null;
  const cappedPrompt = skill.prompt.slice(0, 2000);
  return `[Skill /${skill.name} from project config]: ${cappedPrompt}`;
}
