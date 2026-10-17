import { GoogleAuthProvider, reauthenticateWithPopup, signInWithPopup, signOut } from 'firebase/auth';
import { auth } from '../../../core/firebase-config.js';

// drive.file only lets the app see the files it creates, and covers both
// spreadsheets.create and sharing those files.
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_TTL_MS = 50 * 60 * 1000;
let cachedToken = null;
// Google shows Drive access as a checkbox on its consent screen. If it was left unticked,
// the next attempt forces that screen again so the person can grant it.
let forceConsent = false;

export class GoogleSheetsError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

// Uses the existing Firebase Google provider to get an OAuth access token. Visitors who
// were not signed in are signed out again so the scoring side never leaves a session behind.
export async function getGoogleAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  const provider = new GoogleAuthProvider();
  provider.addScope(DRIVE_FILE_SCOPE);
  provider.setCustomParameters({ prompt: forceConsent ? 'consent select_account' : 'select_account' });

  const hadUser = Boolean(auth.currentUser);
  let result;
  try {
    result = hadUser
      ? await reauthenticateWithPopup(auth.currentUser, provider)
      : await signInWithPopup(auth, provider);
  } catch (error) {
    const code = String(error?.code || '');
    if (code.includes('popup-closed') || code.includes('cancelled-popup')) throw new GoogleSheetsError('cancelled');
    if (code.includes('popup-blocked')) throw new GoogleSheetsError('popup-blocked');
    throw new GoogleSheetsError('auth-failed', code || error?.message);
  }

  const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if (!hadUser) await signOut(auth).catch(() => {});
  if (!token) throw new GoogleSheetsError('auth-failed', 'No access token');
  cachedToken = { token, expiresAt: Date.now() + TOKEN_TTL_MS };
  forceConsent = false;
  return token;
}

async function googleFetch(url, token, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (response.ok) return response.json();

  const payload = await response.json().catch(() => ({}));
  const message = payload?.error?.message || `HTTP ${response.status}`;
  const disabled = (payload?.error?.details || []).some(detail => detail?.reason === 'SERVICE_DISABLED')
    || /has not been used|is disabled/i.test(message);
  if (response.status === 401) cachedToken = null;
  if (response.status === 403 && /insufficient authentication scopes/i.test(message)) {
    cachedToken = null;
    forceConsent = true;
    throw new GoogleSheetsError('scope-missing', message);
  }
  throw new GoogleSheetsError(disabled ? 'api-disabled' : 'request-failed', message);
}

/* ---------- Spreadsheet layout ---------- */

const SHEET_COPY = {
  en: {
    setupTab: 'SETUP',
    awardsTab: 'AWARDS',
    setupTitle: 'SCORESHEET SETUP',
    pageantName: 'Pageant name',
    maxScore: 'Max score per judge',
    judges: 'JUDGES',
    judgeLabel: number => `Judge ${number}`,
    howTitle: 'HOW IT WORKS',
    how: [
      'Rename the judges here once: every tab updates.',
      'Type the delegates in column B of the first tab. Judges type their scores in their own column.',
      'TOTAL and RANK update automatically. The LIVE RANKING panel on the right is always sorted.',
      'Set QUALIFY TOP on each tab: the qualified delegates appear in the next tab automatically.',
      'Finish a phase before scoring the next one: changing earlier scores can change who qualifies.',
      'Grey cells are formulas. Use a dot for decimals (9.5).'
    ],
    colDelegate: 'DELEGATE',
    colTotal: 'TOTAL',
    colRank: 'RANK',
    colStatus: 'STATUS',
    colComments: 'COMMENTS',
    liveRanking: 'LIVE RANKING',
    qualifyTop: 'QUALIFY TOP',
    placements: 'PLACEMENTS',
    advanceTo: name => `advance to ${name}`,
    finalPlacements: 'final placements',
    scoresEntered: 'Scores entered',
    tie: '⚠ TIE AT THE CUTOFF',
    qualified: '✓ QUALIFIED',
    winner: '👑 WINNER',
    runnerUp: rankRef => `(${rankRef}-1)&IF(${rankRef}-1=1,"ST",IF(${rankRef}-1=2,"ND",IF(${rankRef}-1=3,"RD","TH")))&" RUNNER-UP"`,
    scoreHint: 'Enter a number from 0 to the max score in SETUP. Use a dot for decimals (9.5).',
    awardsTitle: 'SPECIAL AWARDS',
    award: 'AWARD',
    awardWinner: 'WINNER',
    protectedNote: 'Formula cells'
  },
  es: {
    setupTab: 'CONFIGURACIÓN',
    awardsTab: 'PREMIOS',
    setupTitle: 'CONFIGURACIÓN DEL SCORESHEET',
    pageantName: 'Nombre del certamen',
    maxScore: 'Puntaje máximo por juez',
    judges: 'JUECES',
    judgeLabel: number => `Juez ${number}`,
    howTitle: 'CÓMO FUNCIONA',
    how: [
      'Cambia aquí el nombre de los jueces una sola vez: todos los tabs se actualizan.',
      'Escribe las delegadas en la columna B del primer tab. Cada juez escribe en su columna.',
      'TOTAL y RANK se calculan solos. El panel LIVE RANKING de la derecha siempre está ordenado.',
      'Define CLASIFICAN en cada tab: las clasificadas aparecen solas en el siguiente tab.',
      'Termina una fase antes de calificar la siguiente: cambiar puntajes anteriores puede cambiar quién clasifica.',
      'Las celdas grises son fórmulas. Usa punto para decimales (9.5).'
    ],
    colDelegate: 'DELEGADA',
    colTotal: 'TOTAL',
    colRank: 'RANK',
    colStatus: 'ESTADO',
    colComments: 'COMENTARIOS',
    liveRanking: 'LIVE RANKING',
    qualifyTop: 'CLASIFICAN',
    placements: 'POSICIONES',
    advanceTo: name => `pasan a ${name}`,
    finalPlacements: 'posiciones finales',
    scoresEntered: 'Puntajes ingresados',
    tie: '⚠ EMPATE EN EL CORTE',
    qualified: '✓ CLASIFICA',
    winner: '👑 GANADORA',
    runnerUp: rankRef => `(${rankRef}-1)&"ª FINALISTA"`,
    scoreHint: 'Ingresa un número de 0 al puntaje máximo de CONFIGURACIÓN. Usa punto para decimales (9.5).',
    awardsTitle: 'PREMIOS ESPECIALES',
    award: 'PREMIO',
    awardWinner: 'GANADORA',
    protectedNote: 'Celdas con fórmula'
  }
};

const COLORS = {
  ink: '#09090b',
  panel: '#18181b',
  header: '#27272a',
  gold: '#fbbf24',
  goldSoft: '#fef3c7',
  goldStrong: '#fde68a',
  white: '#ffffff',
  text: '#18181b',
  muted: '#71717a',
  mutedOnDark: '#a1a1aa',
  formulaBg: '#f4f4f5',
  missing: '#f1f1f3',
  border: '#e4e4e7',
  tieBg: '#fed7aa',
  tieText: '#9a3412',
  warn: '#fb923c'
};

function rgb(hex) {
  const value = hex.replace('#', '');
  return {
    red: parseInt(value.slice(0, 2), 16) / 255,
    green: parseInt(value.slice(2, 4), 16) / 255,
    blue: parseInt(value.slice(4, 6), 16) / 255
  };
}

function colLetter(index) {
  let letter = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

function quoteSheet(name) {
  return `'${String(name).replace(/'/g, "''")}'`;
}

function fmt({ bg, color, bold, size = 10, align, valign = 'MIDDLE', pattern, wrap, borders, italic } = {}) {
  const format = {
    verticalAlignment: valign,
    textFormat: { fontFamily: 'Inter', fontSize: size, bold: Boolean(bold), italic: Boolean(italic) },
    wrapStrategy: wrap ? 'WRAP' : 'OVERFLOW_CELL'
  };
  if (bg) format.backgroundColorStyle = { rgbColor: rgb(bg) };
  if (color) format.textFormat.foregroundColorStyle = { rgbColor: rgb(color) };
  if (align) format.horizontalAlignment = align;
  if (pattern) format.numberFormat = { type: 'NUMBER', pattern };
  if (borders) format.borders = borders;
  return format;
}

const thin = color => ({ style: 'SOLID', colorStyle: { rgbColor: rgb(color) } });
const medium = color => ({ style: 'SOLID_MEDIUM', colorStyle: { rgbColor: rgb(color) } });
const cellBorders = { bottom: thin(COLORS.border), right: thin(COLORS.border) };

const textCell = (value, format) => ({ userEnteredValue: { stringValue: String(value) }, userEnteredFormat: format });
const formulaCell = (formula, format) => ({ userEnteredValue: { formulaValue: formula }, userEnteredFormat: format });
const numberCell = (value, format) => ({ userEnteredValue: { numberValue: value }, userEnteredFormat: format });
const blankCell = format => ({ userEnteredFormat: format });

function gridRange(sheetId, startRow, endRow, startCol, endCol) {
  return { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol };
}

function customRule(ranges, formula, format) {
  return {
    ranges,
    booleanRule: {
      condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] },
      format
    }
  };
}

const SETUP_ID = 1;
const AWARDS_ID = 99;
const SETUP_TITLE_ROW = 3; // 1-based row of the pageant name in SETUP
const SETUP_MAX_ROW = 4;
const SETUP_FIRST_JUDGE_ROW = 7;

function buildSetupSheet({ copy, title, judgeNames, maxScore }) {
  const rows = [];
  const darkRow = (cells, height) => ({ cells, height });
  const banner = fmt({ bg: COLORS.ink, color: COLORS.gold, bold: true, size: 16 });
  const label = fmt({ color: COLORS.text, bold: true, size: 10, borders: { bottom: thin(COLORS.border) } });
  const input = fmt({ bg: COLORS.white, color: COLORS.text, bold: true, size: 11, borders: { bottom: medium(COLORS.gold), top: thin(COLORS.border), left: thin(COLORS.border), right: thin(COLORS.border) } });
  const section = fmt({ bg: COLORS.panel, color: COLORS.gold, bold: true, size: 9 });

  rows.push(darkRow([textCell(`⚙  ${copy.setupTitle}`, banner), blankCell(banner)], 46));
  rows.push(darkRow([blankCell(fmt()), blankCell(fmt())], 14));
  rows.push(darkRow([textCell(copy.pageantName, label), textCell(title, input)], 32));
  rows.push(darkRow([textCell(copy.maxScore, label), numberCell(maxScore, input)], 32));
  rows.push(darkRow([blankCell(fmt()), blankCell(fmt())], 14));
  rows.push(darkRow([textCell(copy.judges, section), blankCell(section)], 28));
  judgeNames.forEach((name, index) => {
    rows.push(darkRow([textCell(copy.judgeLabel(index + 1), label), textCell(name, input)], 30));
  });
  rows.push(darkRow([blankCell(fmt()), blankCell(fmt())], 14));
  const howStart = rows.length;
  rows.push(darkRow([textCell(copy.howTitle, section), blankCell(section)], 28));
  copy.how.forEach((line, index) => {
    rows.push(darkRow([textCell(`${index + 1}.  ${line}`, fmt({ color: COLORS.text, size: 10, wrap: true })), blankCell(fmt())], 40));
  });

  const merges = copy.how.map((_, index) => gridRange(SETUP_ID, howStart + 1 + index, howStart + 2 + index, 0, 2));

  return {
    properties: {
      sheetId: SETUP_ID,
      title: copy.setupTab,
      index: 0,
      gridProperties: { rowCount: rows.length + 2, columnCount: 3, hideGridlines: true },
      tabColorStyle: { rgbColor: rgb(COLORS.header) }
    },
    data: [{
      startRow: 0,
      startColumn: 0,
      rowData: rows.map(row => ({ values: row.cells })),
      rowMetadata: rows.map(row => ({ pixelSize: row.height })),
      columnMetadata: [{ pixelSize: 240 }, { pixelSize: 380 }, { pixelSize: 40 }]
    }],
    merges
  };
}

function buildPhaseSheet({ copy, sheetId, index, phase, prevPhase, nextPhase, isFirst, isLast, judgeCount, rowCount, delegates }) {
  const J = judgeCount;
  const R = rowCount;
  const E = 4 + R; // last 1-based data row
  const T = 2 + J; // total
  const RK = T + 1; // rank
  const ST = T + 2; // status
  const CM = T + 3; // comments
  const GAP = T + 4;
  const P0 = T + 5; // live ranking
  const P2 = T + 7;
  const columnCount = P2 + 1;
  const L = colLetter;
  const setupRef = quoteSheet(copy.setupTab);
  const rankCol = `$${L(RK)}$5:$${L(RK)}$${E}`;
  const totalCol = `$${L(T)}$5:$${L(T)}$${E}`;

  const banner = fmt({ bg: COLORS.ink, color: COLORS.gold, bold: true, size: 18 });
  const titleFmt = fmt({ bg: COLORS.ink, color: COLORS.white, bold: true, size: 14 });
  const titleGold = fmt({ bg: COLORS.ink, color: COLORS.gold, bold: true, size: 9 });
  const control = fmt({ bg: COLORS.panel, color: COLORS.mutedOnDark, size: 9 });
  const controlLabel = fmt({ bg: COLORS.panel, color: COLORS.white, bold: true, size: 9 });
  const controlInput = fmt({ bg: COLORS.white, color: COLORS.ink, bold: true, size: 12, align: 'CENTER', borders: { top: medium(COLORS.gold), bottom: medium(COLORS.gold), left: medium(COLORS.gold), right: medium(COLORS.gold) } });
  const controlWarn = fmt({ bg: COLORS.panel, color: COLORS.warn, bold: true, size: 9 });
  const headerBorders = { bottom: medium(COLORS.gold) };
  const header = align => fmt({ bg: COLORS.header, color: COLORS.white, bold: true, size: 9, align, borders: headerBorders });
  const panelHeader = align => fmt({ bg: COLORS.gold, color: COLORS.ink, bold: true, size: 9, align, borders: headerBorders });

  const formulaFmt = (align, extra = {}) => fmt({ bg: COLORS.formulaBg, color: COLORS.text, align, borders: cellBorders, ...extra });
  const inputFmt = (align, extra = {}) => fmt({ bg: COLORS.white, color: COLORS.text, align, borders: cellBorders, ...extra });

  const rows = [];
  const fill = (cells, format) => {
    while (cells.length < columnCount) cells.push(blankCell(format));
    return cells;
  };

  // Row 1: pageant name from SETUP.
  rows.push(fill([formulaCell(`=UPPER(${setupRef}!$B$${SETUP_TITLE_ROW})`, banner)], banner));

  // Row 2: phase name + live ranking label.
  const row2 = fill([textCell(phase.name.toUpperCase(), titleFmt)], titleFmt);
  row2[P0] = textCell(copy.liveRanking, titleGold);
  rows.push(row2);

  // Row 3: controls.
  const row3 = fill([textCell(isLast ? copy.placements : copy.qualifyTop, controlLabel)], control);
  row3[2] = numberCell(phase.qualify, controlInput);
  row3[3] = isLast
    ? textCell(copy.finalPlacements, control)
    : formulaCell(`="  "&C3&" ${copy.advanceTo(nextPhase.name.toUpperCase())}"`, control);
  row3[ST] = formulaCell(`=IF(AND(C3>0,COUNTIF(${rankCol},"<="&C3)>C3),"${copy.tie}","")`, controlWarn);
  row3[CM] = formulaCell(`="${copy.scoresEntered}: "&COUNT(C5:${L(T - 1)}${E})&" / "&(SUMPRODUCT(--(LEN(B5:B${E})>0))*${J})`, control);
  rows.push(row3);

  // Row 4: headers.
  const row4 = [
    textCell('#', header('CENTER')),
    textCell(copy.colDelegate, header('LEFT'))
  ];
  for (let j = 0; j < J; j += 1) {
    row4.push(formulaCell(`=UPPER(${setupRef}!$B$${SETUP_FIRST_JUDGE_ROW + j})`, header('CENTER')));
  }
  row4.push(textCell(copy.colTotal, header('RIGHT')));
  row4.push(textCell(copy.colRank, header('CENTER')));
  row4.push(textCell(copy.colStatus, header('LEFT')));
  row4.push(textCell(copy.colComments, header('LEFT')));
  row4.push(blankCell(fmt()));
  row4.push(textCell(copy.colRank, panelHeader('CENTER')));
  row4.push(textCell(copy.colDelegate, panelHeader('LEFT')));
  row4.push(textCell(copy.colTotal, panelHeader('RIGHT')));
  rows.push(row4);

  const prevRef = prevPhase ? quoteSheet(prevPhase.name.toUpperCase()) : null;
  for (let i = 0; i < R; i += 1) {
    const r = 5 + i;
    const cells = [];
    cells.push(formulaCell(`=IF(B${r}="","",ROW()-4)`, formulaFmt('CENTER', { color: COLORS.muted, size: 9 })));

    if (isFirst) {
      const name = delegates[i];
      cells.push(name ? textCell(name, inputFmt('LEFT', { bold: true })) : blankCell(inputFmt('LEFT', { bold: true })));
    } else if (i === 0) {
      cells.push(formulaCell(
        `=IFERROR(FILTER(${prevRef}!$B$5:$B$${E},${prevRef}!${rankCol}<>"",${prevRef}!${rankCol}<=${prevRef}!$C$3),"")`,
        formulaFmt('LEFT', { bold: true })
      ));
    } else {
      cells.push(blankCell(formulaFmt('LEFT', { bold: true })));
    }

    for (let j = 0; j < J; j += 1) cells.push(blankCell(inputFmt('CENTER')));

    const scoreRange = `C${r}:${L(T - 1)}${r}`;
    cells.push(formulaCell(`=IF(COUNT(${scoreRange})=0,"",SUM(${scoreRange}))`, formulaFmt('RIGHT', { bold: true, pattern: '0.00' })));
    cells.push(formulaCell(`=IF(OR(B${r}="",${L(T)}${r}=""),"",RANK(${L(T)}${r},${totalCol},0))`, formulaFmt('CENTER', { bold: true, size: 11 })));

    const rankRef = `${L(RK)}${r}`;
    const status = isLast
      ? `=IF(${rankRef}="","",IF(${rankRef}=1,"${copy.winner}",IF(${rankRef}<=$C$3,${copy.runnerUp(rankRef)},"")))`
      : `=IF(${rankRef}="","",IF(${rankRef}<=$C$3,"${copy.qualified}",""))`;
    cells.push(formulaCell(status, formulaFmt('LEFT', { bold: true, size: 9 })));
    cells.push(blankCell(inputFmt('LEFT', { size: 9, wrap: true })));
    cells.push(blankCell(fmt()));

    const panelFmt = (align, extra = {}) => fmt({ bg: COLORS.white, color: COLORS.text, align, borders: cellBorders, ...extra });
    if (i === 0) {
      cells.push(formulaCell(
        `=IFERROR(SORT(FILTER({${L(RK)}5:${L(RK)}${E},B5:B${E},${L(T)}5:${L(T)}${E}},${L(RK)}5:${L(RK)}${E}<>""),1,TRUE),"")`,
        panelFmt('CENTER', { bold: true })
      ));
    } else {
      cells.push(blankCell(panelFmt('CENTER', { bold: true })));
    }
    cells.push(blankCell(panelFmt('LEFT', { bold: true })));
    cells.push(blankCell(panelFmt('RIGHT', { pattern: '0.00' })));
    rows.push(cells);
  }

  const heights = [46, 34, 32, 30, ...Array(R).fill(26)];
  const widths = [40, 230, ...Array(J).fill(88), 84, 64, 130, 220, 24, 60, 200, 84];

  const dataRows = [4, E];
  const conditionalFormats = [
    customRule([gridRange(sheetId, ...dataRows, 2, T)], '=AND($B5<>"",C5="")', { backgroundColorStyle: { rgbColor: rgb(COLORS.missing) } }),
    customRule(
      [gridRange(sheetId, ...dataRows, RK, RK + 1)],
      `=AND($${L(RK)}5<>"",$${L(RK)}5<=$C$3,$${L(RK)}5+COUNTIF(${rankCol},$${L(RK)}5)-1>$C$3)`,
      { backgroundColorStyle: { rgbColor: rgb(COLORS.tieBg) }, textFormat: { bold: true, foregroundColorStyle: { rgbColor: rgb(COLORS.tieText) } } }
    )
  ];
  if (isLast) {
    conditionalFormats.push(customRule(
      [gridRange(sheetId, ...dataRows, 0, CM), gridRange(sheetId, ...dataRows, P0, P2 + 1)],
      `=$${L(RK)}5=1`,
      { backgroundColorStyle: { rgbColor: rgb(COLORS.goldStrong) }, textFormat: { bold: true } }
    ));
  }
  conditionalFormats.push(customRule(
    [gridRange(sheetId, ...dataRows, 0, CM)],
    `=AND($${L(RK)}5<>"",$${L(RK)}5<=$C$3)`,
    { backgroundColorStyle: { rgbColor: rgb(COLORS.goldSoft) } }
  ));
  conditionalFormats.push(customRule(
    [gridRange(sheetId, ...dataRows, P0, P2 + 1)],
    `=AND($${L(P0)}5<>"",$${L(P0)}5<=$C$3)`,
    { backgroundColorStyle: { rgbColor: rgb(COLORS.goldSoft) } }
  ));

  const warn = range => ({ range, description: copy.protectedNote, warningOnly: true });
  const protectedRanges = [
    warn(gridRange(sheetId, 0, 2, 0, columnCount)),
    warn(gridRange(sheetId, 2, 3, 0, 2)),
    warn(gridRange(sheetId, 2, 3, 3, columnCount)),
    warn(gridRange(sheetId, 3, 4, 0, columnCount)),
    warn(gridRange(sheetId, ...dataRows, 0, isFirst ? 1 : 2)),
    warn(gridRange(sheetId, ...dataRows, T, ST + 1)),
    warn(gridRange(sheetId, ...dataRows, P0, P2 + 1))
  ];

  return {
    sheet: {
      properties: {
        sheetId,
        title: phase.name.toUpperCase(),
        index,
        gridProperties: { rowCount: E, columnCount, frozenRowCount: 4, hideGridlines: true },
        tabColorStyle: { rgbColor: rgb(COLORS.gold) }
      },
      data: [{
        startRow: 0,
        startColumn: 0,
        rowData: rows.map(values => ({ values })),
        rowMetadata: heights.map(pixelSize => ({ pixelSize })),
        columnMetadata: widths.map(pixelSize => ({ pixelSize }))
      }],
      conditionalFormats,
      protectedRanges
    },
    scoreValidation: {
      setDataValidation: {
        range: gridRange(sheetId, 4, E, 2, T),
        rule: {
          condition: {
            type: 'CUSTOM_FORMULA',
            values: [{ userEnteredValue: `=AND(ISNUMBER(C5),C5>=0,C5<=INDIRECT("${quoteSheet(copy.setupTab)}!B${SETUP_MAX_ROW}"))` }]
          },
          inputMessage: copy.scoreHint,
          strict: true
        }
      }
    },
    gapColumn: GAP
  };
}

function buildAwardsSheet({ copy, awards, firstPhaseName, rowCount }) {
  const banner = fmt({ bg: COLORS.ink, color: COLORS.gold, bold: true, size: 18 });
  const titleFmt = fmt({ bg: COLORS.ink, color: COLORS.white, bold: true, size: 14 });
  const header = align => fmt({ bg: COLORS.header, color: COLORS.white, bold: true, size: 9, align, borders: { bottom: medium(COLORS.gold) } });
  const cellFmt = (align, extra = {}) => fmt({ bg: COLORS.white, color: COLORS.text, align, borders: cellBorders, ...extra });
  const setupRef = quoteSheet(copy.setupTab);
  const lines = [...awards, ...Array(Math.max(0, 10 - awards.length)).fill('')];

  const rows = [
    [formulaCell(`=UPPER(${setupRef}!$B$${SETUP_TITLE_ROW})`, banner), blankCell(banner), blankCell(banner)],
    [textCell(copy.awardsTitle, titleFmt), blankCell(titleFmt), blankCell(titleFmt)],
    [textCell('#', header('CENTER')), textCell(copy.award, header('LEFT')), textCell(copy.awardWinner, header('LEFT'))],
    ...lines.map((label, index) => [
      numberCell(index + 1, cellFmt('CENTER', { color: COLORS.muted, size: 9 })),
      label ? textCell(label, cellFmt('LEFT', { bold: true })) : blankCell(cellFmt('LEFT', { bold: true })),
      blankCell(cellFmt('LEFT'))
    ])
  ];

  return {
    sheet: {
      properties: {
        sheetId: AWARDS_ID,
        title: copy.awardsTab,
        gridProperties: { rowCount: rows.length + 5, columnCount: 3, frozenRowCount: 3, hideGridlines: true },
        tabColorStyle: { rgbColor: rgb(COLORS.goldStrong) }
      },
      data: [{
        startRow: 0,
        startColumn: 0,
        rowData: rows.map(values => ({ values })),
        rowMetadata: [46, 34, 30, ...lines.map(() => 30)].map(pixelSize => ({ pixelSize })),
        columnMetadata: [{ pixelSize: 48 }, { pixelSize: 320 }, { pixelSize: 280 }]
      }]
    },
    winnerValidation: {
      setDataValidation: {
        range: gridRange(AWARDS_ID, 3, 3 + lines.length, 2, 3),
        rule: {
          condition: { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: `=${quoteSheet(firstPhaseName.toUpperCase())}!$B$5:$B$${4 + rowCount}` }] },
          strict: false,
          showCustomUi: true
        }
      }
    }
  };
}

export const DEFAULT_GOOGLE_PHASES = [
  { name: 'Opening', qualify: 15 },
  { name: 'Swimsuit', qualify: 10 },
  { name: 'Evening Gown', qualify: 5 },
  { name: 'Q&A', qualify: 5 }
];

export const DEFAULT_AWARDS = ['Best in National Costume', 'Best in Introduction', 'Best in Preliminaries - Swim', 'Best in Preliminaries - EG'];

export function buildGoogleSpreadsheet({ title, judgeNames, delegates = [], language = 'en', maxScore = 10, phases = DEFAULT_GOOGLE_PHASES, awards = DEFAULT_AWARDS }) {
  const copy = SHEET_COPY[language === 'es' ? 'es' : 'en'];
  const rowCount = Math.max(50, delegates.length + 10);
  const sheets = [buildSetupSheet({ copy, title, judgeNames, maxScore })];
  const validations = [];

  phases.forEach((phase, index) => {
    const built = buildPhaseSheet({
      copy,
      sheetId: 10 + index,
      index: index + 1,
      phase,
      prevPhase: phases[index - 1],
      nextPhase: phases[index + 1],
      isFirst: index === 0,
      isLast: index === phases.length - 1,
      judgeCount: judgeNames.length,
      rowCount,
      delegates
    });
    sheets.push(built.sheet);
    validations.push(built.scoreValidation);
  });

  const awardsSheet = buildAwardsSheet({ copy, awards, firstPhaseName: phases[0].name, rowCount });
  awardsSheet.sheet.properties.index = phases.length + 1;
  sheets.push(awardsSheet.sheet);
  validations.push(awardsSheet.winnerValidation);

  return {
    createBody: {
      // en_US keeps formula syntax (commas, dot decimals) predictable for every viewer.
      properties: { title: `${title} · Scoresheet`, locale: 'en_US' },
      sheets
    },
    batchRequests: validations
  };
}

export async function createGoogleScoresheet(options, { shareAnyoneWithLink = true } = {}) {
  const token = await getGoogleAccessToken();
  const { createBody, batchRequests } = buildGoogleSpreadsheet(options);

  const spreadsheet = await googleFetch('https://sheets.googleapis.com/v4/spreadsheets', token, createBody);
  const { spreadsheetId, spreadsheetUrl } = spreadsheet;

  await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, token, { requests: batchRequests });

  let shared = false;
  if (shareAnyoneWithLink) {
    try {
      await googleFetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`, token, { role: 'writer', type: 'anyone' });
      shared = true;
    } catch (error) {
      console.warn('Could not share the spreadsheet', error);
    }
  }

  return { spreadsheetId, spreadsheetUrl, shared };
}
