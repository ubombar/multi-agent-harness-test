import matter from 'gray-matter';
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

export interface SkillMeta {
	name: string;
	description: string;
	tags: string[];
	tools: string[];
}

export interface Skill {
	meta: SkillMeta;
	content: string;
	dir: string;
}

export async function loadSkills(skillsDir: string): Promise<Skill[]> {
	const skills: Skill[] = [];

	try {
		const files = await glob('*/SKILL.md', { cwd: skillsDir });
		for (const file of files) {
			try {
				const fullPath = path.resolve(skillsDir, file);
				const raw = fs.readFileSync(fullPath, 'utf-8');
				const parsed = matter(raw);

				const meta: SkillMeta = {
					name: parsed.data.name || path.dirname(file),
					description: parsed.data.description || '',
					tags: parsed.data.tags || [],
					tools: parsed.data.tools || [],
				};

				skills.push({
					meta,
					content: parsed.content,
					dir: path.resolve(skillsDir, path.dirname(file)),
				});
			} catch (err) {
				console.error(`[skills] Failed to load ${file}:`, err);
			}
		}
	} catch {
		// skills dir doesn't exist
	}

	return skills;
}

export function parseSkillFile(filePath: string): Skill | null {
	try {
		const raw = fs.readFileSync(filePath, 'utf-8');
		const parsed = matter(raw);
		const meta: SkillMeta = {
			name: parsed.data.name || path.basename(path.dirname(filePath)),
			description: parsed.data.description || '',
			tags: parsed.data.tags || [],
			tools: parsed.data.tools || [],
		};
		return {
			meta,
			content: parsed.content,
			dir: path.dirname(filePath),
		};
	} catch {
		return null;
	}
}
