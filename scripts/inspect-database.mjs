import mysql from 'mysql2/promise';
import {writeFile} from 'node:fs/promises';
const database=process.env.DB_NAME||'cdms_followup';
const connection=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,connectTimeout:10000});
try {
 await connection.query('SET SESSION TRANSACTION READ ONLY');
 const [schemas]=await connection.execute('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',[database]);
 if(!schemas.length){console.log(JSON.stringify({database,exists:false}));process.exitCode=2;}
 else {
  const [columns]=await connection.execute('SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_COMMENT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME,ORDINAL_POSITION',[database]);
  await writeFile(new URL('../artifacts/database-schema.json',import.meta.url),JSON.stringify({database,inspectedAt:new Date().toISOString(),columns},null,2));
  console.log(JSON.stringify({database,exists:true,tables:[...new Set(columns.map(c=>c.TABLE_NAME))],columnCount:columns.length}));
 }
}finally{await connection.end();}
