/**
 * Generates the SQL to create your admin login.
 *
 *   node tools/make-password.js you@email.com "your password here"
 *
 * Prints an INSERT statement. Run it against D1 and you can log in.
 * Your password is never stored anywhere, only the hash of it.
 */

const [, , email, password] = process.argv;

if (!email || !password) {
    console.error('Usage: node tools/make-password.js <email> "<password>"');
    process.exit(1);
}
if (password.length < 10) {
    console.error('Please use at least 10 characters.');
    process.exit(1);
}

const { webcrypto } = require('crypto');
const crypto = webcrypto;
const ITERATIONS = 210000;

const toHex = (buf) =>
    [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

(async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256);

    const sql = `INSERT INTO admin_users (email, password_hash, salt) VALUES `
        + `('${email.trim().toLowerCase().replace(/'/g, "''")}', '${toHex(bits)}', '${toHex(salt)}');`;

    console.log('\nRun this command:\n');
    console.log(`npx wrangler d1 execute digitail --remote --command="${sql}"`);
    console.log('');
})();
