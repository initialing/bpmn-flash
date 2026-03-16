export interface ProcessDefinition {
	id: string;
	name: string;
	elements: Map<string, Element>;
	sequenceFlows: Map<string, SequenceFlow>;
}

export interface Element {
	id: string;
	type: string;
	name: string;
	incoming: string[];
	outgoing: string[];
	properties: Record<string, string>;
}

export interface SequenceFlow {
	id: string;
	sourceRef: string;
	targetRef: string;
	conditionExpression: string | null;
}

export interface Token {
	id: string;
	elementId: string;
	data: Record<string, string>;
	createdAt: Date;
}

export interface Item {
	id: string;
	elementId: string;
	name: string;
	type: string;
	status: 'wait' | 'completed' | 'active';
	data: Record<string, string>;
	startedAt: Date;
	endedAt?: Date;
	assignee?: string;
	candidateUsers?: string[];
	candidateGroups?: string[];
}

export interface ParsedXmlElement {
	[key: string]: {
		tagName: string;
		properties: Record<string, string>;
		children?: ParsedXmlElement[];
		content?: string;
	};
}

export interface ParseToken {
	type: 'text' | 'tag';
	value: string;
}

export interface CheckExecutionError {
	code: string;
	reason?: string[];
}
