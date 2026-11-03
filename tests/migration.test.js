import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {mkdtempSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {validateState} from '../src/store.js';
test('desktop SQLite migration preserves entries/styles and never modifies the source',()=>{
 const dir=mkdtempSync(join(tmpdir(),'workflow-migration-'));try{
  const db=join(dir,'tempo.sqlite3'),out=join(dir,'backup.json');
  execFileSync('python3',['-c',`import sqlite3,sys
c=sqlite3.connect(sys.argv[1]);c.executescript("CREATE TABLE entries(id TEXT,category TEXT,note TEXT,start_ms INTEGER,end_ms INTEGER); CREATE TABLE preferences(key TEXT,value TEXT); INSERT INTO entries VALUES('a','professional','SolidWorks',100,200); INSERT INTO preferences VALUES('category.professional.color','#55C5AC'); INSERT INTO preferences VALUES('category.professional.icon','bolt'); INSERT INTO preferences VALUES('opacity','90');");c.commit();c.close()`,db]);
  const before=readFileSync(db);execFileSync('python3',[resolve('scripts/migrate-desktop.py'),db,out]);const data=validateState(JSON.parse(readFileSync(out,'utf8')));
  assert.equal(data.styles.professional.color,'#55C5AC');assert.equal(data.styles.professional.icon,'bolt');assert.equal(data.preferences.opacity,90);assert.equal(data.entries[0].note,'SolidWorks');assert.deepEqual(readFileSync(db),before);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
