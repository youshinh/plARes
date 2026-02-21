# Claude Code Skills Directory

This directory (`.claude/skills` and `.claudecode/skills`) is reserved for **Claude Code Skills**.
As described in [Supercharge ADK Development with Claude Code Skills](https://medium.com/google-cloud/supercharge-adk-development-with-claude-code-skills-d192481cbe72), Claude Code intelligently discovers and loads specialized capabilities placed in these folders.

## Adding a Skill

To add a new skill to this project:

1. Create a new subfolder for your skill (e.g., `.claude/skills/adk-core/`).
2. Inside the folder, create a `SKILL.md` file.
3. Add the required YAML frontmatter at the top of `SKILL.md`:
   ```yaml
   ---
   name: your-skill-name
   description: A detailed description of when Claude should invoke this skill.
   ---
   ```
4. Below the frontmatter, write Markdown instructions for Claude to follow when executing the skill.
5. (Optional) Provide supporting scripts (Python, JS, etc.) or JSON templates in the same folder.

Claude will automatically parse this folder and utilize the skills contextually when assisting with the ADK or project development.
