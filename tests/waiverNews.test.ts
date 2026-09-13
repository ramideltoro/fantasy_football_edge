import test from 'node:test';
import assert from 'node:assert/strict';
import { matchingNews } from '../server/waiverNews.ts';
test('news matches complete normalized player names in supplied excerpts',()=>{
 const rows=[{title:'Updates',excerpt:'A.J. Brown practiced.',publishedAt:'2026-09-12'}, {title:'Brown news',excerpt:'Other player',publishedAt:'2026-09-12'}];
 assert.equal(matchingNews('AJ Brown',rows).length,1);
 assert.equal(matchingNews('Brownie',rows).length,0);
});
