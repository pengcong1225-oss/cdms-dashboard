import mysql from 'mysql2/promise';

export function createReadOnlyPool(config = {}) {
 const raw = mysql.createPool({
  host: config.host ?? process.env.DB_HOST,
  port: Number(config.port ?? process.env.DB_PORT ?? 3306),
  database: config.database ?? process.env.DB_NAME ?? 'cdms_followup',
  user: config.user ?? process.env.DB_USER,
  password: config.password ?? process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: Number(config.connectionLimit ?? 4),
  queueLimit: 0,
  connectTimeout: Number(config.connectTimeout ?? 10000),
  enableKeepAlive: true,
  supportBigNumbers: true,
  bigNumberStrings: true
 });
 return {
  async execute(sql, params = []) {
   const connection = await raw.getConnection();
   try {
    await connection.query('SET SESSION TRANSACTION READ ONLY');
    return await connection.execute(sql, params);
   } finally {
    connection.release();
   }
  },
  async end() { return raw.end(); }
 };
}
