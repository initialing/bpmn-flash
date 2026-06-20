/**
 * ID 生成工具 — 使用 nanoid
 */
import { nanoid } from 'nanoid';

export function generateId(): string {
  return nanoid();
}

/** 生成长 ID（用于流程实例等场景，需要更高区分度） */
export function generateLongId(): string {
  return nanoid(21);
}
