declare module 'sql.js' {
  interface Database {
    prepare(sql: string): Statement;
    run(sql: string, params?: any[]): void;
    close(): void;
  }

  interface Statement {
    bind(params?: any[]): void;
    step(): boolean;
    getAsObject(): Record<string, any>;
    free(): void;
  }

  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }

  export type { Database, Statement, SqlJsStatic };
  export default function initSqlJs(): Promise<SqlJsStatic>;
}
