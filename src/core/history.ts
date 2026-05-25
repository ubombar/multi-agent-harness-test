import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface HistoryStep {
	tool: string;
	args: unknown;
	result: string;
}

export type HistoryStatus = 'running' | 'completed' | 'preempted' | 'interrupted';

export interface HistoryEntry {
	id: string;
	timestamp: string;
	from: string;
	content: string;
	priority: 'normal' | 'high';
	status: HistoryStatus;
	steps: HistoryStep[];
}

export class History {
	private filePath: string;
	private entries: HistoryEntry[] = [];

	constructor(agentId: string) {
		const dir = path.resolve(process.cwd(), 'agents', agentId);
		fs.mkdirSync(dir, { recursive: true });
		this.filePath = path.join(dir, 'history.json');

		if (fs.existsSync(this.filePath)) {
			try {
				this.entries = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
			} catch {
				this.entries = [];
			}
		}
	}

	startEntry(from: string, content: string, priority: 'normal' | 'high'): HistoryEntry {
		const entry: HistoryEntry = {
			id: uuidv4(),
			timestamp: new Date().toISOString(),
			from,
			content,
			priority,
			status: 'running',
			steps: [],
		};
		this.entries.push(entry);
		this.save();
		return entry;
	}

	appendStep(entry: HistoryEntry, tool: string, args: unknown, result: string): void {
		entry.steps.push({ tool, args, result });
		this.save();
	}

	finalizeEntry(entry: HistoryEntry, status: HistoryStatus): void {
		entry.status = status;
		this.save();
	}

	private save(): void {
		fs.writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2));
	}

	getAll(): HistoryEntry[] {
		return this.entries;
	}
}
