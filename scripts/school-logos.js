// Resolve a school name — either our canonical name or the way an opponent
// feed spells it — to its logo slug, or null if it is not a Skyland school.
// Used by split-schedule.js to tag each served game with the crest(s) the
// calendar should show.
//
// Deliberately conservative: a wrong crest is worse than a missing one.

const path = require('path');
const schools = require(path.join(__dirname, '..', 'data', 'schools.json'));
const LIST = Array.isArray(schools) ? schools : (schools.schools || schools);

function norm(s) {
    return String(s || '').toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/\bsaint\b/g, 'st')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\b(high|school|schools|regional|senior|hs|the|charter|academy)\b/g, ' ')
        .replace(/\s+/g, ' ').trim();
}

// canonical name -> slug
const BY_KEY = new Map();
for (const s of LIST) BY_KEY.set(norm(s.name), s.slug);

// Shorter or alternate spellings that opponents and feeds commonly use.
// "Bridgewater" alone is deliberately absent — it could mean Bridgewater-Raritan
// or Bridgewater-Somerville (a known co-op), so it cannot be safely resolved.
const ALIASES = {
    // Bernards
    'bernards':             'bernards',
    'bernards hs':          'bernards',

    // Bound Brook
    'bound brook':          'bound-brook',

    // Bridgewater-Raritan
    'bridgewater raritan':  'bridgewater-raritan',
    'brrhs':                'bridgewater-raritan',
    'br':                   'bridgewater-raritan',   // common shorthand in-conference

    // Delaware Valley
    'del val':              'delaware-valley',
    'delval':               'delaware-valley',
    'delaware valley':      'delaware-valley',

    // Gill St. Bernard's
    'gsb':                  'gill-st-bernards',
    'gill st bernards':     'gill-st-bernards',
    'gill st bernard':      'gill-st-bernards',
    'gill st bernards school': 'gill-st-bernards',

    // Hunterdon Central
    'hunterdon central':    'hunterdon-central',
    'hc':                   'hunterdon-central',
    'hcrhs':                'hunterdon-central',

    // Immaculata
    'immaculata':           'immaculata',
    'ihs':                  'immaculata',

    // Montgomery
    'montgomery':           'montgomery',

    // Mount Saint Mary
    'mount st mary':        'mount-saint-mary',
    'mt saint mary':        'mount-saint-mary',
    'mt st mary':           'mount-saint-mary',
    'mount saint mary':     'mount-saint-mary',
    'msma':                 'mount-saint-mary',

    // North Hunterdon
    'north hunterdon':      'north-hunterdon',
    'n hunterdon':          'north-hunterdon',

    // North Plainfield
    'north plainfield':     'north-plainfield',
    'n plainfield':         'north-plainfield',
    'nplainfield':          'north-plainfield',

    // North Warren
    'north warren':         'north-warren',
    'n warren':             'north-warren',

    // Phillipsburg
    'phillipsburg':         'phillipsburg',
    'p-burg':               'phillipsburg',
    'pburg':                'phillipsburg',

    // Pingry
    'pingry':               'pingry',
    'pingry school':        'pingry',

    // Ridge
    'ridge':                'ridge',
    'ridge hs':             'ridge',

    // Rutgers Prep
    'rutgers prep':         'rutgers-prep',
    'rutgers preparatory':  'rutgers-prep',
    'rps':                  'rutgers-prep',

    // Somerville
    'somerville':           'somerville',

    // South Hunterdon
    'south hunterdon':      'south-hunterdon',
    's hunterdon':          'south-hunterdon',

    // Voorhees
    'voorhees':             'voorhees',

    // Warren Hills
    'warren hills':         'warren-hills',
    'w hills':              'warren-hills',

    // Watchung Hills
    'watchung hills':       'watchung-hills',
    'watchung':             'watchung-hills',
};

function logoSlug(name) {
    const k = norm(name);
    if (!k) return null;
    if (BY_KEY.has(k)) return BY_KEY.get(k);
    if (ALIASES[k]) return ALIASES[k];
    return null;
}

module.exports = { logoSlug, norm };
