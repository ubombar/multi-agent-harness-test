export interface Message {
	type: 'message' | 'shutdown';
	from?: string;
	to?: string;
	content?: string;
	priority?: 'normal' | 'high';
}

export class MessageQueue {
	private normal: Message[] = [];
	private high: Message[] = [];
	private resolver: ((msg: Message) => void) | null = null;

	push(message: Message): void {
		if (this.resolver) {
			const resolve = this.resolver;
			this.resolver = null;
			resolve(message);
			return;
		}
		if (message.priority === 'high') {
			this.high.push(message);
		} else {
			this.normal.push(message);
		}
	}

	hasHighPriority(): boolean {
		return this.high.length > 0;
	}

	isEmpty(): boolean {
		return this.high.length === 0 && this.normal.length === 0;
	}

	waitForNext(): Promise<Message> {
		if (this.high.length > 0) {
			return Promise.resolve(this.high.shift()!);
		}
		if (this.normal.length > 0) {
			return Promise.resolve(this.normal.shift()!);
		}
		return new Promise((resolve) => {
			this.resolver = resolve;
		});
	}

	drain(): Message[] {
		const all = [...this.high, ...this.normal];
		this.high = [];
		this.normal = [];
		return all;
	}
}
