import fs from 'fs';
import path from 'path';

const root = path.resolve('public/scripts/rpg');
const publicRoot = path.resolve('public');
const scriptsRoot = path.join(publicRoot, 'scripts');

function walk(dir, out = []) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p, out);
        else if (ent.name.endsWith('.js')) out.push(p);
    }
    return out;
}

const targets = {
    'script.js': path.join(publicRoot, 'script.js'),
    'lib.js': path.join(publicRoot, 'lib.js'),
    'extensions.js': path.join(scriptsRoot, 'extensions.js'),
    'group-chats.js': path.join(scriptsRoot, 'group-chats.js'),
    'power-user.js': path.join(scriptsRoot, 'power-user.js'),
    'slash-commands.js': path.join(scriptsRoot, 'slash-commands.js'),
    'reasoning.js': path.join(scriptsRoot, 'reasoning.js'),
    'textgen-settings.js': path.join(scriptsRoot, 'textgen-settings.js'),
    'utils.js': path.join(scriptsRoot, 'utils.js'),
    'extensions/shared.js': path.join(scriptsRoot, 'extensions/shared.js'),
};

function classify(spec) {
    const base = spec.replace(/\\/g, '/');
    if (base.includes('slash-commands.js')) return 'slash-commands.js';
    if (base.includes('extensions/shared.js')) return 'extensions/shared.js';
    if (base.endsWith('group-chats.js')) return 'group-chats.js';
    if (base.endsWith('power-user.js')) return 'power-user.js';
    if (base.endsWith('reasoning.js')) return 'reasoning.js';
    if (base.endsWith('textgen-settings.js')) return 'textgen-settings.js';
    if (base.endsWith('lib.js')) return 'lib.js';
    if (base.endsWith('extensions.js')) return 'extensions.js';
    if (base.endsWith('script.js')) return 'script.js';
    if (base.endsWith('utils.js') && (base.match(/\.\.\//g) || []).length >= 3) return 'utils.js';
    return null;
}

const importRe = /from\s+(['"])([^'"]+)\1/g;
let changedFiles = 0;

for (const file of walk(root)) {
    const text = fs.readFileSync(file, 'utf8');
    let changed = false;
    const next = text.replace(importRe, (full, quote, spec) => {
        if (!spec.startsWith('.')) return full;
        const key = classify(spec);
        if (!key || !targets[key]) return full;
        let rel = path.relative(path.dirname(file), targets[key]).replace(/\\/g, '/');
        if (!rel.startsWith('.')) rel = `./${rel}`;
        if (rel === spec.replace(/\\/g, '/')) return full;
        changed = true;
        return `from ${quote}${rel}${quote}`;
    });
    if (changed) {
        fs.writeFileSync(file, next);
        changedFiles++;
        console.log('fixed', path.relative(root, file));
    }
}

console.log('rewrote', changedFiles, 'files');
