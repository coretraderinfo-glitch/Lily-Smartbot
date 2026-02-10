import 'dotenv/config';
import { db } from './src/db';

async function check() {
    try {
        const res = await db.query('SELECT count(*) FROM groups');
        console.log('GROUP_COUNT:', res.rows[0].count);
        const groups = await db.query('SELECT id, title FROM groups LIMIT 5');
        console.log('GROUPS:', groups.rows);
    } catch (e) {
        console.error('ERROR:', e);
    } finally {
        process.exit();
    }
}
check();
