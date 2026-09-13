// Build the favicons, touch icons and social sharing card from the SEC seal.
//
// Run by hand when the seal or the wording changes:
//   NODE_PATH=<somewhere with sharp> node scripts/build-brand-images.js
//
// sharp is not a repository dependency - package.json is deliberately not in
// git (see .gitignore), and nothing automated runs this. The outputs are
// committed, so a normal checkout never needs to build them.
//
// Two different marks, on purpose. The seal carries its name around the rim,
// and at 32px that lettering collapses into noise - it is simply too detailed
// to survive a browser tab. Small sizes therefore use a purpose-drawn mark that
// keeps the seal's structure, a red ring around a navy field, with SEC large
// enough to read. Anything 180px or larger shows the real seal, where the
// detail is an asset rather than mush.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SEAL = path.join(ROOT, 'images', 'sec-logo-footer.png');
const ICONS = path.join(ROOT, 'images', 'icons');

// The site's black-and-silver palette. Legacy names kept so the drawing code
// below reads unchanged: NAVY is the dark tab-favicon field, RED the silver
// ring/accent. The compass sits on a SILVER tile at large sizes because its
// black-and-white linework would half-vanish on a dark field.
const NAVY = '#0d0e10';
const NAVY_DEEP = '#000000';
const NAVY_LIT = '#2a2e35';
const RED = '#c3c9d1';
const SILVER = '#c3c9d1';

// Oswald is a web font, and Arial Narrow turned out not to be available to the
// renderer either - the headline fell back to full-width Arial and ran off the
// edge of the card. So the two headline lines are given an exact textLength
// and allowed to compress into it. That guarantees they fit whatever font is
// resolved, and squeezing them to a common width gives the flush, condensed
// look Oswald has on the site.
const CONDENSED = 'Arial, Helvetica, sans-serif';
const HEAD_X = 452;
const HEAD_W = 708;          // from HEAD_X to a 40px right margin

// The renderer honours neither Arial Narrow nor textLength, so guessing a font
// size just moved the overflow around. Measure instead: render the line once at
// a reference size, find the rightmost inked pixel, and scale from the real
// width. Text advances linearly with font size, so one measurement is exact.
async function inkWidth(text, fontSize) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="300">' +
        '<rect width="4000" height="300" fill="black"/>' +
        '<text x="10" y="200" font-family="' + CONDENSED + '" font-size="' + fontSize +
        '" font-weight="bold" fill="white">' + text + '</text></svg>';
    const { data, info } = await sharp(Buffer.from(svg)).greyscale().raw()
        .toBuffer({ resolveWithObject: true });
    let right = 0;
    for (let y = 0; y < info.height; y++) {
        const row = y * info.width;
        for (let x = info.width - 1; x > right; x--) {
            if (data[row + x] > 40) { right = x; break; }
        }
    }
    return right - 10;
}

// Largest size at which every line still fits the column.
async function fitSize(lines, maxWidth, ceiling) {
    const REF = 100;
    let best = ceiling;
    for (const line of lines) {
        const w = await inkWidth(line, REF);
        best = Math.min(best, Math.floor(REF * maxWidth / w));
    }
    return best;
}

function mark(size) {
    const r = size / 2;
    const inner = r * 0.78;
    const fontSize = size * 0.40;
    return Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '">' +
        '<circle cx="' + r + '" cy="' + r + '" r="' + r + '" fill="' + RED + '"/>' +
        '<circle cx="' + r + '" cy="' + r + '" r="' + inner + '" fill="' + NAVY + '"/>' +
        '<text x="' + r + '" y="' + (r + fontSize * 0.35) + '" text-anchor="middle" ' +
        'font-family="' + CONDENSED + '" font-size="' + fontSize + '" font-weight="bold" ' +
        'fill="#ffffff" letter-spacing="' + (-size * 0.015) + '">SEC</text>' +
        '</svg>');
}

// The compass on a silver field, for home screens and app icons. Silver rather
// than the dark tab colour because the compass linework is black-and-white and
// would half-disappear on a dark field.
async function sealOn(size) {
    const pad = Math.round(size * 0.10);
    const inner = await sharp(SEAL)
        .resize(size - pad * 2, size - pad * 2, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png().toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background: SILVER } })
        .composite([{ input: inner, top: pad, left: pad }])
        .png().toBuffer();
}

// A minimal .ico wrapping PNG frames. Browsers still request /favicon.ico by
// default, and a 404 there is a needless miss in every server log.
function ico(frames) {
    const head = Buffer.alloc(6);
    head.writeUInt16LE(0, 0);
    head.writeUInt16LE(1, 2);
    head.writeUInt16LE(frames.length, 4);

    let offset = 6 + frames.length * 16;
    const entries = [];
    for (const f of frames) {
        const e = Buffer.alloc(16);
        e.writeUInt8(f.size >= 256 ? 0 : f.size, 0);
        e.writeUInt8(f.size >= 256 ? 0 : f.size, 1);
        e.writeUInt8(0, 2);
        e.writeUInt8(0, 3);
        e.writeUInt16LE(1, 4);
        e.writeUInt16LE(32, 6);
        e.writeUInt32LE(f.data.length, 8);
        e.writeUInt32LE(offset, 12);
        offset += f.data.length;
        entries.push(e);
    }
    return Buffer.concat([head, ...entries, ...frames.map(f => f.data)]);
}

async function card() {
    const L1 = 'BIG NORTH';
    const L2 = 'CONFERENCE';
    const head = await fitSize([L1, L2], HEAD_W, 88);
    console.log('  headline fits at ' + head + 'px');
    return Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">' +
        '<defs>' +
        '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0%" stop-color="' + NAVY_DEEP + '"/>' +
        '<stop offset="60%" stop-color="' + NAVY + '"/>' +
        '<stop offset="100%" stop-color="' + NAVY_LIT + '"/>' +
        '</linearGradient>' +
        '<radialGradient id="glow" cx="0.12" cy="0" r="0.75">' +
        '<stop offset="0%" stop-color="#c3c9d1" stop-opacity="0.22"/>' +
        '<stop offset="100%" stop-color="#c3c9d1" stop-opacity="0"/>' +
        '</radialGradient>' +
        '</defs>' +
        '<rect width="1200" height="630" fill="url(#bg)"/>' +
        '<rect width="1200" height="630" fill="url(#glow)"/>' +
        // the red keyline along the foot, the site's own accent
        '<rect x="0" y="618" width="1200" height="12" fill="' + RED + '"/>' +
        '<text x="' + HEAD_X + '" y="258" font-family="' + CONDENSED + '" font-size="' + head + '" font-weight="bold" ' +
        'fill="#ffffff">' + L1 + '</text>' +
        '<text x="' + HEAD_X + '" y="' + (258 + head * 1.06) + '" font-family="' + CONDENSED + '" font-size="' + head + '" font-weight="bold" ' +
        'fill="#ffffff">' + L2 + '</text>' +
        '<rect x="' + HEAD_X + '" y="382" width="96" height="7" fill="' + RED + '"/>' +
        '<text x="' + HEAD_X + '" y="448" font-family="Arial, Helvetica, sans-serif" font-size="30" ' +
        'fill="#c3c9d1">41 member high schools</text>' +
        '<text x="' + HEAD_X + '" y="492" font-family="Arial, Helvetica, sans-serif" font-size="30" ' +
        'fill="#c3c9d1">Bergen · Passaic counties</text>' +
        '<text x="' + HEAD_X + '" y="562" font-family="Arial, Helvetica, sans-serif" font-size="26" ' +
        'font-weight="bold" fill="#ffffff" letter-spacing="2">BIGNORTHCONFERENCE.COM</text>' +
        '</svg>');
}

(async () => {
    fs.mkdirSync(ICONS, { recursive: true });

    // small marks
    for (const size of [16, 32, 48]) {
        await sharp(mark(size)).png().toFile(path.join(ICONS, 'favicon-' + size + '.png'));
    }

    // the .ico browsers ask for without being told
    const frames = [];
    for (const size of [16, 32, 48]) {
        frames.push({ size, data: await sharp(mark(size)).png().toBuffer() });
    }
    fs.writeFileSync(path.join(ROOT, 'favicon.ico'), ico(frames));

    // the real seal where the detail survives
    for (const [size, name] of [[180, 'apple-touch-icon.png'], [192, 'icon-192.png'], [512, 'icon-512.png']]) {
        fs.writeFileSync(path.join(ICONS, name), await sealOn(size));
    }

    // the sharing card, with the seal set into it
    const seal = await sharp(SEAL).resize(300, 300, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    await sharp(await card())
        .composite([{ input: seal, top: 160, left: 110 }])
        .png({ quality: 90 })
        .toFile(path.join(ROOT, 'images', 'social-card.png'));

    const report = [
        ['favicon.ico', path.join(ROOT, 'favicon.ico')],
        ['images/social-card.png', path.join(ROOT, 'images', 'social-card.png')],
        ['icons/favicon-32.png', path.join(ICONS, 'favicon-32.png')],
        ['icons/apple-touch-icon.png', path.join(ICONS, 'apple-touch-icon.png')],
        ['icons/icon-512.png', path.join(ICONS, 'icon-512.png')],
    ];
    for (const [label, file] of report) {
        console.log('  ' + label.padEnd(28) + (fs.statSync(file).size / 1024).toFixed(1) + ' KB');
    }
})();
