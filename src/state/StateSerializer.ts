import { ProcessState } from './WorkflowState.js';

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
	static serializeToObject(state: ProcessState): any {
		return this.makeSerializable(state);
	}

	/**
	 * 从字符串反序列化流程状态
	 */
	static deserialize(serializedState: string): ProcessState {
		const parsed = JSON.parse(serializedState);
		return this.makeDeserializable(parsed);
	}

	/**
	 * 从对象反序列化流程状态
	 */
	static deserializeFromObject(obj: any): ProcessState {
		return this.makeDeserializable(obj);
	}

	/**
	 * 将状态转换为可序列化的格式
	 */
	private static makeSerializable(state: ProcessState): any {
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
	private static makeDeserializable(data: any): ProcessState {
		return {
			...data,
			createdAt: new Date(data.createdAt),
			startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
			endedAt: data.endedAt ? new Date(data.endedAt) : undefined,
			tokens: data.tokens.map((token: any) => ({
				...token,
				createdAt: new Date(token.createdAt),
			})),
			items: data.items.map((item: any) => ({
				...item,
				startedAt: new Date(item.startedAt),
				endedAt: item.endedAt ? new Date(item.endedAt) : undefined,
			})),
			history: data.history.map((entry: any) => ({
				...entry,
				timestamp: new Date(entry.timestamp),
			})),
		};
	}

	/**
	 * 序列化为压缩格式（用于存储优化）
	 */
	static serializeCompressed(state: ProcessState): string {
		const compressed = {
			i: state.id, // id
			n: state.name, // name
			s: state.status, // status
			cd: state.createdAt.toISOString(), // createdAt
			sd: state.startedAt?.toISOString() || null, // startedAt
			ed: state.endedAt?.toISOString() || null, // endedAt
			di: state.definitionId, // definitionId
			d: state.data, // data
			v: state.variables, // variables
			tk: state.tokens.map(t => ({
				i: t.id,
				e: t.elementId,
				d: t.data,
				c: t.createdAt.toISOString(),
			})), // tokens
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
			})), // items
			h: state.history.map(h => ({
				i: h.id,
				e: h.elementId,
				et: h.elementType,
				a: h.action,
				t: h.timestamp.toISOString(),
				da: h.data,
				er: h.error,
			})), // history
		};
		return JSON.stringify(compressed);
	}

	/**
	 * 从压缩格式反序列化
	 */
	static deserializeCompressed(compressedStr: string): ProcessState {
		const data = JSON.parse(compressedStr);
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
			tokens: data.tk.map((t: any) => ({
				id: t.i,
				elementId: t.e,
				data: t.d,
				createdAt: new Date(t.c),
			})),
			items: data.it.map((i: any) => ({
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
			history: data.h.map((h: any) => ({
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
