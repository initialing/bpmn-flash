import { ProcessState, ExecutionHistoryEntry } from './WorkflowState.js';
import { Token, Item } from '../types/index.js';

/**
 * 可序列化的状态接口
 */
interface SerializableProcessState extends Omit<
	ProcessState,
	'createdAt' | 'startedAt' | 'endedAt' | 'tokens' | 'items' | 'history'
> {
	createdAt: string;
	startedAt: string | null;
	endedAt: string | null;
	tokens: SerializableToken[];
	items: SerializableItem[];
	history: SerializableHistoryEntry[];
}

interface SerializableToken extends Omit<Token, 'createdAt'> {
	createdAt: string;
}

interface SerializableItem extends Omit<Item, 'startedAt' | 'endedAt'> {
	startedAt: string;
	endedAt: string | null;
}

interface SerializableHistoryEntry extends Omit<
	ExecutionHistoryEntry,
	'timestamp'
> {
	timestamp: string;
}

/**
 * 压缩格式的状态接口
 */
interface CompressedState {
	i: string;
	n: string;
	s: ProcessState['status'];
	cd: string;
	sd: string | null;
	ed: string | null;
	di: string;
	d: Record<string, any>;
	v: Record<string, any>;
	tk: CompressedToken[];
	it: CompressedItem[];
	h: CompressedHistoryEntry[];
}

interface CompressedToken {
	i: string;
	e: string;
	d: Record<string, any>;
	c: string;
}

interface CompressedItem {
	i: string;
	e: string;
	n: string;
	t: string;
	st: Item['status'];
	d: Record<string, any>;
	sa: string;
	ea: string | null;
	a: string | null;
	cu: string[] | null;
	cg: string[] | null;
}

interface CompressedHistoryEntry {
	i: string;
	e: string;
	et: string;
	a: ExecutionHistoryEntry['action'];
	t: string;
	da?: Record<string, any>;
	er?: string;
}

/**
 * 状态序列化器
 * 负责流程状态的序列化和反序列化
 */
export class StateSerializer {
	/**
	 * 序列化流程状态为字符串
	 */
	static serialize(state: ProcessState): string {
		return JSON.stringify(this.makeSerializable(state));
	}

	/**
	 * 序列化流程状态为对象
	 */
	static serializeToObject(state: ProcessState): SerializableProcessState {
		return this.makeSerializable(state);
	}

	/**
	 * 从字符串反序列化流程状态
	 */
	static deserialize(serializedState: string): ProcessState {
		const parsed = JSON.parse(serializedState) as SerializableProcessState;
		return this.makeDeserializable(parsed);
	}

	/**
	 * 从对象反序列化流程状态
	 */
	static deserializeFromObject(obj: SerializableProcessState): ProcessState {
		return this.makeDeserializable(obj);
	}

	/**
	 * 将状态转换为可序列化的格式
	 */
	private static makeSerializable(
		state: ProcessState
	): SerializableProcessState {
		return {
			...state,
			createdAt: state.createdAt.toISOString(),
			startedAt: state.startedAt ? state.startedAt.toISOString() : null,
			endedAt: state.endedAt ? state.endedAt.toISOString() : null,
			tokens: state.tokens.map(token => ({
				...token,
				createdAt: token.createdAt.toISOString(),
			})),
			items: state.items.map(item => ({
				...item,
				startedAt: item.startedAt.toISOString(),
				endedAt: item.endedAt ? item.endedAt.toISOString() : null,
			})),
			history: state.history.map(entry => ({
				...entry,
				timestamp: entry.timestamp.toISOString(),
			})),
		};
	}

	/**
	 * 将序列化的数据转换回流程状态
	 */
	private static makeDeserializable(
		data: SerializableProcessState
	): ProcessState {
		return {
			...data,
			createdAt: new Date(data.createdAt),
			startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
			endedAt: data.endedAt ? new Date(data.endedAt) : undefined,
			tokens: data.tokens.map((token: SerializableToken) => ({
				...token,
				createdAt: new Date(token.createdAt),
			})),
			items: data.items.map((item: SerializableItem) => ({
				...item,
				startedAt: new Date(item.startedAt),
				endedAt: item.endedAt ? new Date(item.endedAt) : undefined,
			})),
			history: data.history.map((entry: SerializableHistoryEntry) => ({
				...entry,
				timestamp: new Date(entry.timestamp),
			})),
		};
	}

	/**
	 * 序列化为压缩格式（用于存储优化）
	 */
	static serializeCompressed(state: ProcessState): string {
		const compressed: CompressedState = {
			i: state.id,
			n: state.name,
			s: state.status,
			cd: state.createdAt.toISOString(),
			sd: state.startedAt?.toISOString() || null,
			ed: state.endedAt?.toISOString() || null,
			di: state.definitionId,
			d: state.data,
			v: state.variables,
			tk: state.tokens.map(t => ({
				i: t.id,
				e: t.elementId,
				d: t.data,
				c: t.createdAt.toISOString(),
			})),
			it: state.items.map(i => ({
				i: i.id,
				e: i.elementId,
				n: i.name,
				t: i.type,
				st: i.status,
				d: i.data,
				sa: i.startedAt.toISOString(),
				ea: i.endedAt?.toISOString() || null,
				a: i.assignee,
				cu: i.candidateUsers,
				cg: i.candidateGroups,
			})),
			h: state.history.map(h => ({
				i: h.id,
				e: h.elementId,
				et: h.elementType,
				a: h.action,
				t: h.timestamp.toISOString(),
				da: h.data,
				er: h.error,
			})),
		};
		return JSON.stringify(compressed);
	}

	/**
	 * 从压缩格式反序列化
	 */
	static deserializeCompressed(compressedStr: string): ProcessState {
		const data = JSON.parse(compressedStr) as CompressedState;
		return {
			id: data.i,
			name: data.n,
			status: data.s,
			createdAt: new Date(data.cd),
			startedAt: data.sd ? new Date(data.sd) : undefined,
			endedAt: data.ed ? new Date(data.ed) : undefined,
			definitionId: data.di,
			data: data.d,
			variables: data.v,
			tokens: data.tk.map((t: CompressedToken) => ({
				id: t.i,
				elementId: t.e,
				data: t.d,
				createdAt: new Date(t.c),
			})),
			items: data.it.map((i: CompressedItem) => ({
				id: i.i,
				elementId: i.e,
				name: i.n,
				type: i.t,
				status: i.st,
				data: i.d,
				startedAt: new Date(i.sa),
				endedAt: i.ea ? new Date(i.ea) : undefined,
				assignee: i.a,
				candidateUsers: i.cu,
				candidateGroups: i.cg,
			})),
			history: data.h.map((h: CompressedHistoryEntry) => ({
				id: h.i,
				elementId: h.e,
				elementType: h.et,
				action: h.a,
				timestamp: new Date(h.t),
				data: h.da,
				error: h.er,
			})),
		};
	}
}
