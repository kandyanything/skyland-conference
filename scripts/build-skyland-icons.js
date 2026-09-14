// Regenerate Skyland Conference favicons from real logo PNG
// Source: images/skyland-mark.png (170x170 real logo from rschooltoday CDN)

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join('C:\\Users\\ScottRosenberg\\OneDrive - PlayOn Sports\\Desktop\\skyland-conference');
const SRC  = path.join(ROOT, 'images', 'skyland-mark.png');
const ICONS = path.join(ROOT, 'images', 'icons');

async function main() {
    const src = sharp(SRC).png();

    // favicon-16.png
    await src.clone().resize(16,16).toFile(path.join(ICONS, 'favicon-16.png'));
    console.log('favicon-16.png');

    // favicon-32.png
    await src.clone().resize(32,32).toFile(path.join(ICONS, 'favicon-32.png'));
    console.log('favicon-32.png');

    // favicon-48.png
    await src.clone().resize(48,48).toFile(path.join(ICONS, 'favicon-48.png'));
    console.log('favicon-48.png');

    // apple-touch-icon.png (180x180 with white padding)
    await src.clone().resize(152,152).extend({
        top:14, bottom:14, left:14, right:14,
        background: { r:255, g:255, b:255, alpha:1 }
    }).resize(180,180).toFile(path.join(ICONS, 'apple-touch-icon.png'));
    console.log('apple-touch-icon.png');

    // icon-192.png
    await src.clone().resize(192,192).toFile(path.join(ICONS, 'icon-192.png'));
    console.log('icon-192.png');

    // icon-512.png
    await src.clone().resize(512,512).toFile(path.join(ICONS, 'icon-512.png'));
    console.log('icon-512.png');

    // favicon.ico - write a 32x32 PNG as .ico (browsers accept it)
    await src.clone().resize(32,32).toFile(path.join(ROOT, 'favicon.ico'));
    console.log('favicon.ico');

    console.log('All done!');
}

main().catch(e => { console.error(e); process.exit(1); });
