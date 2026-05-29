// 扩展端 IndexedDB（Dexie）schema 定义。
// 仅声明表结构，不在此处执行写入。
//
// pages：每次访问独立一行（visitedAt 不同即新行），不去重。
// digests：按 date 唯一存储当日汇总，便于本地离线查看。
// settings：单行配置，主键固定为 "singleton"。

import Dexie, { type Table } from "dexie";
import type { DailyDigest, PageRecord, Settings } from "@pwm/shared";

export interface LocalPageRecord extends PageRecord {
  uploaded?: 0 | 1;
}

export class PwmDB extends Dexie {
  // 表声明
  pages!: Table<LocalPageRecord, number>;
  digests!: Table<DailyDigest, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super("pwm");
    // v1：初始 schema
    // pages: 自增主键 id；按 visitedAt、domain 建索引便于按日聚合
    // digests: 以 date 为主键（YYYY-MM-DD）
    // settings: 以 id 为主键（固定 "singleton"）
    this.version(1).stores({
      pages: "++id, visitedAt, domain",
      digests: "date",
      settings: "id",
    });
    this.version(2).stores({});
    // v3：为 pages 增加 uploaded 索引，支持增量上传（只发未上传页面的 textContent）
    this.version(3).stores({
      pages: "++id, visitedAt, domain, uploaded",
    });
  }
}

export const db = new PwmDB();
