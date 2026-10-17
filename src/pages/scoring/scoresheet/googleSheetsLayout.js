// Builds the Google Sheets API request for the scoresheet layout (bilingual ES / EN).
// This file must stay dependency-free: scripts/build-apps-script.mjs bundles it into the
// Google Apps Script web app (scripts/google-apps-script/Code.gs) that creates the sheets.

const T = {
  setupTab: '⚙ SETUP',
  awardsTab: '🏆 PREMIOS · AWARDS',
  brand: 'PAGEANTS SCORESHEET',
  setupSubtitle: ['Configuración', 'Setup'],
  pageantName: ['Nombre del certamen', 'Pageant name'],
  maxScore: ['Puntaje máximo por juez', 'Max score per judge'],
  judges: 'JUECES · JUDGES',
  judgeLabel: number => [`Juez ${number}`, `Judge ${number}`],
  howTitle: 'CÓMO FUNCIONA · HOW IT WORKS',
  how: [
    ['Cambia aquí el nombre de los jueces una sola vez: todos los tabs se actualizan.', 'Rename the judges here once: every tab updates.'],
    ['Escribe las delegadas en el primer tab. Cada juez escribe en su columna.', 'Type the delegates in the first tab. Each judge types in their own column.'],
    ['TOTAL y RANK se calculan solos. Marca ORDENAR POR RANK para ver los resultados ordenados (se ordenan solos al completar los puntajes).', 'TOTAL and RANK are automatic. Tick SORT BY RANK to sort the results (they sort themselves once every score is in).'],
    ['Define CLASIFICAN en cada tab: las clasificadas aparecen solas en el siguiente tab.', 'Set QUALIFY TOP on each tab: the qualified delegates appear in the next tab automatically.'],
    ['Las fórmulas están bloqueadas: solo se editan las celdas blancas.', 'Formulas are locked: only the white cells can be edited.'],
    ['Usa punto para decimales (9.5).', 'Use a dot for decimals (9.5).']
  ],
  colDelegate: ['DELEGADA', 'DELEGATE'],
  colTotal: ['TOTAL', 'TOTAL'],
  colRank: ['RANK', 'RANK'],
  colStatus: ['ESTADO', 'STATUS'],
  colComments: ['COMENTARIOS', 'COMMENTS'],
  results: 'RESULTADOS · RESULTS',
  scoring: 'PUNTAJES · SCORING',
  sortByRank: ['ORDENAR POR RANK · SORT BY RANK', '   se ordena solo al completar · auto when complete'],
  qualifyTop: 'CLASIFICAN · QUALIFY TOP',
  placements: 'POSICIONES · PLACEMENTS',
  scoresEntered: 'PUNTAJES · SCORES',
  tie: '⚠ EMPATE EN EL CORTE · TIE AT CUTOFF',
  qualified: '✓ CLASIFICA · QUALIFIED',
  winner: '👑 GANADORA · WINNER',
  runnerUp: rankRef => `(${rankRef}-1)&"ª FINALISTA · "&(${rankRef}-1)&IF(${rankRef}-1=1,"ST",IF(${rankRef}-1=2,"ND",IF(${rankRef}-1=3,"RD","TH")))&" RUNNER-UP"`,
  scoreHint: 'Número de 0 al máximo de SETUP, con punto decimal (9.5). · Number from 0 to the SETUP max, dot decimals (9.5).',
  awardsTitle: 'PREMIOS ESPECIALES · SPECIAL AWARDS',
  award: ['PREMIO', 'AWARD'],
  awardWinner: ['GANADORA', 'WINNER'],
  locked: 'Fórmulas bloqueadas · Locked formulas'
};

const FONT = 'Montserrat';

const COLORS = {
  ink: '#0b0b0c',
  panel: '#161618',
  header: '#232326',
  gold: '#fbbf24',
  goldText: '#a16207',
  goldSoft: '#fef6dc',
  goldMid: '#fce7a6',
  silver: '#e5e7eb',
  bronze: '#f1d3b5',
  white: '#ffffff',
  band: '#fafaf9',
  text: '#1c1917',
  muted: '#78716c',
  mutedOnDark: '#a1a1aa',
  formulaBg: '#f5f5f4',
  missing: '#f0efed',
  border: '#e7e5e4',
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

function fmt({ bg, color, bold, size = 10, align, valign = 'MIDDLE', pattern, wrap, borders, italic, padding } = {}) {
  const format = {
    verticalAlignment: valign,
    textFormat: { fontFamily: FONT, fontSize: size, bold: Boolean(bold), italic: Boolean(italic) },
    wrapStrategy: wrap ? 'WRAP' : 'OVERFLOW_CELL'
  };
  if (bg) format.backgroundColorStyle = { rgbColor: rgb(bg) };
  if (color) format.textFormat.foregroundColorStyle = { rgbColor: rgb(color) };
  if (align) format.horizontalAlignment = align;
  if (pattern) format.numberFormat = { type: 'NUMBER', pattern };
  if (borders) format.borders = borders;
  if (padding) format.padding = padding;
  return format;
}

const thin = color => ({ style: 'SOLID', colorStyle: { rgbColor: rgb(color) } });
const medium = color => ({ style: 'SOLID_MEDIUM', colorStyle: { rgbColor: rgb(color) } });
const rowBorder = { bottom: thin(COLORS.border) };
const pad = { left: 8, right: 8 };

const textCell = (value, format) => ({ userEnteredValue: { stringValue: String(value) }, userEnteredFormat: format });
const formulaCell = (formula, format) => ({ userEnteredValue: { formulaValue: formula }, userEnteredFormat: format });
const numberCell = (value, format) => ({ userEnteredValue: { numberValue: value }, userEnteredFormat: format });
const boolCell = (value, format) => ({ userEnteredValue: { boolValue: value }, userEnteredFormat: format });
const blankCell = format => ({ userEnteredFormat: format });

// Two-line bilingual label: Spanish on top, English smaller and muted underneath.
function bilingualCell([es, en], format, enColor) {
  const text = `${es}\n${en}`;
  return {
    userEnteredValue: { stringValue: text },
    userEnteredFormat: { ...format, wrapStrategy: 'WRAP' },
    textFormatRuns: [
      { startIndex: 0 },
      { startIndex: es.length + 1, format: { bold: false, fontSize: Math.max(7, (format.textFormat?.fontSize || 10) - 2), foregroundColorStyle: { rgbColor: rgb(enColor) } } }
    ]
  };
}

// One line with a muted tail: "MAIN   tail".
function splitToneCell([main, tail], format, tailColor) {
  return {
    userEnteredValue: { stringValue: main + tail },
    userEnteredFormat: format,
    textFormatRuns: [
      { startIndex: 0 },
      { startIndex: main.length, format: { bold: false, italic: true, foregroundColorStyle: { rgbColor: rgb(tailColor) } } }
    ]
  };
}

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

function lockSheet(sheetId, unprotectedRanges) {
  return { range: { sheetId }, description: T.locked, warningOnly: false, unprotectedRanges };
}

const bg = hex => ({ backgroundColorStyle: { rgbColor: rgb(hex) } });

const SETUP_ID = 1;
const AWARDS_ID = 99;
const SETUP_TITLE_ROW = 4; // 1-based rows of the inputs in SETUP (column C)
const SETUP_MAX_ROW = 5;
const SETUP_FIRST_JUDGE_ROW = 8;

function buildSetupSheet({ title, judgeNames, maxScore }) {
  const rows = [];
  const add = (cells, height) => rows.push({ cells, height });
  const dark = fmt({ bg: COLORS.ink });
  const brand = fmt({ bg: COLORS.ink, color: COLORS.gold, bold: true, size: 20 });
  const sub = fmt({ bg: COLORS.ink, color: COLORS.mutedOnDark, size: 10 });
  const label = fmt({ color: COLORS.text, bold: true, size: 10, borders: rowBorder, padding: pad });
  const input = fmt({ bg: COLORS.white, color: COLORS.text, bold: true, size: 12, borders: { bottom: medium(COLORS.gold), top: thin(COLORS.border), left: thin(COLORS.border), right: thin(COLORS.border) }, padding: pad });
  const section = fmt({ bg: COLORS.panel, color: COLORS.gold, bold: true, size: 9, padding: pad });
  const white = fmt({ bg: COLORS.white });

  add([blankCell(dark), textCell(T.brand, brand), blankCell(dark), blankCell(dark)], 58);
  add([blankCell(dark), bilingualCell(T.setupSubtitle, sub, COLORS.mutedOnDark), blankCell(dark), blankCell(dark)], 34);
  add([blankCell(white), blankCell(white), blankCell(white), blankCell(white)], 16);
  add([blankCell(white), bilingualCell(T.pageantName, label, COLORS.muted), textCell(title, input), blankCell(white)], 40);
  add([blankCell(white), bilingualCell(T.maxScore, label, COLORS.muted), numberCell(maxScore, input), blankCell(white)], 40);
  add([blankCell(white), blankCell(white), blankCell(white), blankCell(white)], 16);
  add([blankCell(white), textCell(T.judges, section), blankCell(section), blankCell(white)], 30);
  judgeNames.forEach((name, index) => {
    add([blankCell(white), bilingualCell(T.judgeLabel(index + 1), label, COLORS.muted), textCell(name, input), blankCell(white)], 38);
  });
  add([blankCell(white), blankCell(white), blankCell(white), blankCell(white)], 16);
  const howStart = rows.length;
  add([blankCell(white), textCell(T.howTitle, section), blankCell(section), blankCell(white)], 30);
  T.how.forEach((line, index) => {
    const cell = bilingualCell([`${index + 1}.  ${line[0]}`, `     ${line[1]}`], fmt({ color: COLORS.text, size: 10, wrap: true, borders: rowBorder, padding: pad }), COLORS.muted);
    add([blankCell(white), cell, blankCell(white), blankCell(white)], 50);
  });

  const merges = [gridRange(SETUP_ID, howStart, howStart + 1, 1, 3), gridRange(SETUP_ID, SETUP_FIRST_JUDGE_ROW - 2, SETUP_FIRST_JUDGE_ROW - 1, 1, 3)];
  T.how.forEach((_, index) => merges.push(gridRange(SETUP_ID, howStart + 1 + index, howStart + 2 + index, 1, 3)));

  return {
    properties: {
      sheetId: SETUP_ID,
      title: T.setupTab,
      index: 0,
      gridProperties: { rowCount: rows.length + 2, columnCount: 4, hideGridlines: true },
      tabColorStyle: { rgbColor: rgb(COLORS.header) }
    },
    data: [{
      startRow: 0,
      startColumn: 0,
      rowData: rows.map(row => ({ values: row.cells })),
      rowMetadata: rows.map(row => ({ pixelSize: row.height })),
      columnMetadata: [{ pixelSize: 24 }, { pixelSize: 270 }, { pixelSize: 380 }, { pixelSize: 24 }]
    }],
    merges,
    protectedRanges: [lockSheet(SETUP_ID, [
      gridRange(SETUP_ID, SETUP_TITLE_ROW - 1, SETUP_MAX_ROW, 2, 3),
      gridRange(SETUP_ID, SETUP_FIRST_JUDGE_ROW - 1, SETUP_FIRST_JUDGE_ROW - 1 + judgeNames.length, 2, 3)
    ])]
  };
}

function buildPhaseSheet({ sheetId, index, phase, prevPhase, nextPhase, isFirst, isLast, judgeCount, rowCount, delegates }) {
  const J = judgeCount;
  const R = rowCount;
  const E = 4 + R; // last 1-based data row
  // Score entry table
  const NUM = 1;
  const DEL = 2;
  const J0 = 3;
  const JL = J0 + J - 1;
  const TOT = JL + 1;
  const RK = TOT + 1;
  const ST = RK + 1;
  const CM = ST + 1;
  // Results table
  const GAP = CM + 1;
  const R_RK = GAP + 1;
  const R_DEL = R_RK + 1;
  const R_J0 = R_DEL + 1;
  const R_TOT = R_J0 + J;
  const R_ST = R_TOT + 1;
  const END = R_ST + 1;
  const columnCount = END + 1;

  const L = colLetter;
  const setupRef = quoteSheet(T.setupTab);
  const rankCol = `$${L(RK)}$5:$${L(RK)}$${E}`;
  const totalCol = `$${L(TOT)}$5:$${L(TOT)}$${E}`;
  const qualifyRef = `$${L(J0)}$3`;
  const sortRef = `$${L(R_RK)}$3`;
  const namesCount = `SUMPRODUCT(--(LEN($${L(DEL)}$5:$${L(DEL)}$${E})>0))`;
  const scoresBlock = `$${L(J0)}$5:$${L(JL)}$${E}`;

  const dark = fmt({ bg: COLORS.ink });
  const banner = fmt({ bg: COLORS.ink, color: COLORS.gold, bold: true, size: 20 });
  const phaseFmt = fmt({ bg: COLORS.ink, color: COLORS.white, bold: true, size: 15 });
  const sectionGold = fmt({ bg: COLORS.ink, color: COLORS.gold, bold: true, size: 10 });
  const control = fmt({ bg: COLORS.panel, color: COLORS.mutedOnDark, size: 9 });
  const controlLabel = fmt({ bg: COLORS.panel, color: COLORS.white, bold: true, size: 9, align: 'RIGHT', padding: pad });
  const controlInput = fmt({ bg: COLORS.white, color: COLORS.ink, bold: true, size: 13, align: 'CENTER', borders: { top: medium(COLORS.gold), bottom: medium(COLORS.gold), left: medium(COLORS.gold), right: medium(COLORS.gold) } });
  const controlInfo = fmt({ bg: COLORS.panel, color: COLORS.gold, bold: true, size: 9, padding: pad });
  const controlWarn = fmt({ bg: COLORS.panel, color: COLORS.warn, bold: true, size: 9, padding: pad });
  const checkbox = fmt({ bg: COLORS.panel, color: COLORS.gold, align: 'CENTER', size: 12 });
  const header = align => fmt({ bg: COLORS.header, color: COLORS.white, bold: true, size: 9, align, borders: { bottom: medium(COLORS.gold) }, padding: pad });
  const resultsHeader = align => fmt({ bg: COLORS.gold, color: COLORS.ink, bold: true, size: 9, align, borders: { bottom: medium(COLORS.ink) }, padding: pad });

  const formulaFmt = (align, extra = {}) => fmt({ bg: COLORS.formulaBg, color: COLORS.text, align, borders: rowBorder, padding: pad, ...extra });
  const inputFmt = (align, extra = {}) => fmt({ bg: COLORS.white, color: COLORS.text, align, borders: { ...rowBorder, right: thin(COLORS.border) }, padding: pad, ...extra });
  const resultFmt = (align, extra = {}) => fmt({ color: COLORS.text, align, borders: rowBorder, padding: pad, ...extra });

  const rows = [];
  const filled = format => Array.from({ length: columnCount }, () => blankCell(format));

  // Row 1: pageant name (from SETUP).
  const row1 = filled(dark);
  row1[NUM] = formulaCell(`=UPPER(${setupRef}!$C$${SETUP_TITLE_ROW})`, banner);
  rows.push(row1);

  // Row 2: phase name / section titles.
  const row2 = filled(dark);
  row2[NUM] = textCell(phase.name.toUpperCase(), phaseFmt);
  row2[ST] = textCell(T.scoring, fmt({ bg: COLORS.ink, color: COLORS.mutedOnDark, bold: true, size: 9, align: 'RIGHT' }));
  row2[R_RK] = textCell(T.results, sectionGold);
  rows.push(row2);

  // Row 3: controls.
  const row3 = filled(control);
  row3[0] = blankCell(dark);
  row3[END] = blankCell(dark);
  row3[GAP] = blankCell(dark);
  row3[NUM] = textCell(isLast ? T.placements : T.qualifyTop, controlLabel);
  row3[J0] = numberCell(phase.qualify, controlInput);
  row3[J0 + 1] = isLast
    ? formulaCell(`="TOP "&${qualifyRef}`, controlInfo)
    : formulaCell(`="TOP "&${qualifyRef}&"  →  ${nextPhase.name.toUpperCase()}"`, controlInfo);
  row3[ST] = formulaCell(`=IF(AND(${qualifyRef}>0,COUNTIF(${rankCol},"<="&${qualifyRef})>${qualifyRef}),"${T.tie}","")`, controlWarn);
  row3[CM] = formulaCell(`="${T.scoresEntered}  "&COUNT(${scoresBlock})&" / "&(${namesCount}*${J})`, fmt({ bg: COLORS.panel, color: COLORS.mutedOnDark, size: 9, align: 'RIGHT', padding: pad }));
  row3[R_RK] = boolCell(false, checkbox);
  row3[R_DEL] = splitToneCell(T.sortByRank, fmt({ bg: COLORS.panel, color: COLORS.white, bold: true, size: 9 }), COLORS.mutedOnDark);
  rows.push(row3);

  // Row 4: headers.
  const row4 = filled(fmt());
  row4[0] = blankCell(fmt());
  row4[NUM] = textCell('#', header('CENTER'));
  row4[DEL] = bilingualCell(T.colDelegate, header('LEFT'), COLORS.mutedOnDark);
  row4[R_RK] = textCell('RANK', resultsHeader('CENTER'));
  row4[R_DEL] = bilingualCell(T.colDelegate, resultsHeader('LEFT'), COLORS.header);
  for (let j = 0; j < J; j += 1) {
    const judgeName = `=UPPER(${setupRef}!$C$${SETUP_FIRST_JUDGE_ROW + j})`;
    row4[J0 + j] = formulaCell(judgeName, header('CENTER'));
    row4[R_J0 + j] = formulaCell(judgeName, resultsHeader('CENTER'));
  }
  row4[TOT] = textCell('TOTAL', header('RIGHT'));
  row4[RK] = textCell('RANK', header('CENTER'));
  row4[ST] = bilingualCell(T.colStatus, header('LEFT'), COLORS.mutedOnDark);
  row4[CM] = bilingualCell(T.colComments, header('LEFT'), COLORS.mutedOnDark);
  row4[R_TOT] = textCell('TOTAL', resultsHeader('RIGHT'));
  row4[R_ST] = bilingualCell(T.colStatus, resultsHeader('LEFT'), COLORS.header);
  rows.push(row4);

  const prevRef = prevPhase ? quoteSheet(prevPhase.name.toUpperCase()) : null;
  const resultsArray = `{${L(RK)}5:${L(RK)}${E},${L(DEL)}5:${L(DEL)}${E},${L(J0)}5:${L(JL)}${E},${L(TOT)}5:${L(TOT)}${E},${L(ST)}5:${L(ST)}${E}}`;
  const complete = `AND(${namesCount}>0,COUNT(${scoresBlock})>=${namesCount}*${J})`;

  for (let i = 0; i < R; i += 1) {
    const r = 5 + i;
    const cells = filled(fmt());
    cells[NUM] = formulaCell(`=IF(${L(DEL)}${r}="","",ROW()-4)`, formulaFmt('CENTER', { color: COLORS.muted, size: 9 }));

    if (isFirst) {
      const name = delegates[i];
      cells[DEL] = name ? textCell(name, inputFmt('LEFT', { bold: true })) : blankCell(inputFmt('LEFT', { bold: true }));
    } else if (i === 0) {
      cells[DEL] = formulaCell(
        `=IFERROR(FILTER(${prevRef}!$${L(DEL)}$5:$${L(DEL)}$${E},${prevRef}!${rankCol}<>"",${prevRef}!${rankCol}<=${prevRef}!${qualifyRef}),"")`,
        formulaFmt('LEFT', { bold: true })
      );
    } else {
      cells[DEL] = blankCell(formulaFmt('LEFT', { bold: true }));
    }

    for (let j = 0; j < J; j += 1) cells[J0 + j] = blankCell(inputFmt('CENTER', { size: 11 }));

    const scoreRange = `${L(J0)}${r}:${L(JL)}${r}`;
    cells[TOT] = formulaCell(`=IF(COUNT(${scoreRange})=0,"",SUM(${scoreRange}))`, formulaFmt('RIGHT', { bold: true, pattern: '0.00' }));
    cells[RK] = formulaCell(`=IF(OR(${L(DEL)}${r}="",${L(TOT)}${r}=""),"",RANK(${L(TOT)}${r},${totalCol},0))`, formulaFmt('CENTER', { bold: true, size: 11 }));

    const rankRef = `${L(RK)}${r}`;
    const status = isLast
      ? `=IF(${rankRef}="","",IF(${rankRef}=1,"${T.winner}",IF(${rankRef}<=${qualifyRef},${T.runnerUp(rankRef)},"")))`
      : `=IF(${rankRef}="","",IF(${rankRef}<=${qualifyRef},"${T.qualified}",""))`;
    cells[ST] = formulaCell(status, formulaFmt('LEFT', { bold: true, size: 8, color: COLORS.goldText }));
    cells[CM] = blankCell(inputFmt('LEFT', { size: 9, wrap: true }));

    cells[R_RK] = i === 0
      ? formulaCell(`=IFERROR(LET(data,FILTER(${resultsArray},${L(DEL)}5:${L(DEL)}${E}<>""),IF(OR(${sortRef},${complete}),SORT(data,1,TRUE),data)),"")`, resultFmt('CENTER', { bold: true, size: 12 }))
      : blankCell(resultFmt('CENTER', { bold: true, size: 12 }));
    cells[R_DEL] = blankCell(resultFmt('LEFT', { bold: true }));
    for (let j = 0; j < J; j += 1) cells[R_J0 + j] = blankCell(resultFmt('CENTER', { color: COLORS.muted }));
    cells[R_TOT] = blankCell(resultFmt('RIGHT', { bold: true, size: 11, pattern: '0.00' }));
    cells[R_ST] = blankCell(resultFmt('LEFT', { bold: true, size: 8, color: COLORS.goldText }));
    rows.push(cells);
  }

  const heights = [56, 36, 38, 42, ...Array(R).fill(30)];
  const widths = [];
  widths[0] = 16;
  widths[NUM] = 40;
  widths[DEL] = 220;
  for (let j = 0; j < J; j += 1) { widths[J0 + j] = 84; widths[R_J0 + j] = 70; }
  widths[TOT] = 84;
  widths[RK] = 64;
  widths[ST] = 180;
  widths[CM] = 220;
  widths[GAP] = 28;
  widths[R_RK] = 64;
  widths[R_DEL] = 200;
  widths[R_TOT] = 84;
  widths[R_ST] = 180;
  widths[END] = 16;

  const dataRows = [4, E];
  const qualifiedRow = col => `=AND($${L(col)}5<>"",$${L(col)}5<=${qualifyRef})`;
  const conditionalFormats = [
    customRule([gridRange(sheetId, ...dataRows, J0, JL + 1)], `=AND($${L(DEL)}5<>"",${L(J0)}5="")`, bg(COLORS.missing)),
    customRule(
      [gridRange(sheetId, ...dataRows, RK, RK + 1)],
      `=AND($${L(RK)}5<>"",$${L(RK)}5<=${qualifyRef},$${L(RK)}5+COUNTIF(${rankCol},$${L(RK)}5)-1>${qualifyRef})`,
      { ...bg(COLORS.tieBg), textFormat: { bold: true, foregroundColorStyle: { rgbColor: rgb(COLORS.tieText) } } }
    ),
    // Medal colours on the results rank.
    customRule([gridRange(sheetId, ...dataRows, R_RK, R_RK + 1)], `=$${L(R_RK)}5=1`, { ...bg(COLORS.gold), textFormat: { bold: true, foregroundColorStyle: { rgbColor: rgb(COLORS.ink) } } }),
    customRule([gridRange(sheetId, ...dataRows, R_RK, R_RK + 1)], `=$${L(R_RK)}5=2`, { ...bg(COLORS.silver), textFormat: { bold: true } }),
    customRule([gridRange(sheetId, ...dataRows, R_RK, R_RK + 1)], `=$${L(R_RK)}5=3`, { ...bg(COLORS.bronze), textFormat: { bold: true } })
  ];
  if (isLast) {
    conditionalFormats.push(customRule([gridRange(sheetId, ...dataRows, R_DEL, R_ST + 1)], `=$${L(R_RK)}5=1`, { ...bg(COLORS.goldMid), textFormat: { bold: true } }));
  }
  conditionalFormats.push(customRule([gridRange(sheetId, ...dataRows, NUM, ST + 1)], qualifiedRow(RK), bg(COLORS.goldSoft)));
  conditionalFormats.push(customRule([gridRange(sheetId, ...dataRows, R_DEL, R_ST + 1)], qualifiedRow(R_RK), bg(COLORS.goldSoft)));

  const bandedRanges = [{
    range: gridRange(sheetId, ...dataRows, R_RK, R_ST + 1),
    rowProperties: { firstBandColorStyle: { rgbColor: rgb(COLORS.white) }, secondBandColorStyle: { rgbColor: rgb(COLORS.band) } }
  }];

  const unprotected = [
    gridRange(sheetId, 2, 3, J0, J0 + 1),
    gridRange(sheetId, 2, 3, R_RK, R_RK + 1),
    gridRange(sheetId, ...dataRows, J0, JL + 1),
    gridRange(sheetId, ...dataRows, CM, CM + 1)
  ];
  if (isFirst) unprotected.push(gridRange(sheetId, ...dataRows, DEL, DEL + 1));

  const merges = [
    gridRange(sheetId, 0, 1, NUM, CM + 1),
    gridRange(sheetId, 1, 2, NUM, ST),
    gridRange(sheetId, 1, 2, R_RK, R_ST + 1),
    gridRange(sheetId, 2, 3, NUM, J0),
    gridRange(sheetId, 2, 3, J0 + 1, ST),
    gridRange(sheetId, 2, 3, R_DEL, R_ST + 1)
  ];

  return {
    sheet: {
      properties: {
        sheetId,
        title: phase.name.toUpperCase(),
        index,
        gridProperties: { rowCount: E + 1, columnCount, frozenRowCount: 4, hideGridlines: true },
        tabColorStyle: { rgbColor: rgb(COLORS.gold) }
      },
      data: [{
        startRow: 0,
        startColumn: 0,
        rowData: rows.map(values => ({ values })),
        rowMetadata: heights.map(pixelSize => ({ pixelSize })),
        columnMetadata: widths.map(pixelSize => ({ pixelSize }))
      }],
      merges,
      conditionalFormats,
      bandedRanges,
      protectedRanges: [lockSheet(sheetId, unprotected)]
    },
    validations: [
      {
        setDataValidation: {
          range: gridRange(sheetId, ...dataRows, J0, JL + 1),
          rule: {
            condition: {
              type: 'CUSTOM_FORMULA',
              values: [{ userEnteredValue: `=AND(ISNUMBER(${L(J0)}5),${L(J0)}5>=0,${L(J0)}5<=INDIRECT("${quoteSheet(T.setupTab)}!C${SETUP_MAX_ROW}"))` }]
            },
            inputMessage: T.scoreHint,
            strict: true
          }
        }
      },
      {
        setDataValidation: {
          range: gridRange(sheetId, 2, 3, R_RK, R_RK + 1),
          rule: { condition: { type: 'BOOLEAN' }, showCustomUi: true }
        }
      }
    ]
  };
}

function buildAwardsSheet({ awards, firstPhaseName, rowCount }) {
  const dark = fmt({ bg: COLORS.ink });
  const banner = fmt({ bg: COLORS.ink, color: COLORS.gold, bold: true, size: 20 });
  const titleFmt = fmt({ bg: COLORS.ink, color: COLORS.white, bold: true, size: 13 });
  const header = align => fmt({ bg: COLORS.header, color: COLORS.white, bold: true, size: 9, align, borders: { bottom: medium(COLORS.gold) }, padding: pad });
  const cellFmt = (align, extra = {}) => fmt({ bg: COLORS.white, color: COLORS.text, align, borders: rowBorder, padding: pad, ...extra });
  const setupRef = quoteSheet(T.setupTab);
  const lines = [...awards, ...Array(Math.max(0, 10 - awards.length)).fill('')];
  const white = fmt({ bg: COLORS.white });

  const rows = [
    [blankCell(dark), formulaCell(`=UPPER(${setupRef}!$C$${SETUP_TITLE_ROW})`, banner), blankCell(dark), blankCell(dark), blankCell(dark)],
    [blankCell(dark), textCell(T.awardsTitle, titleFmt), blankCell(dark), blankCell(dark), blankCell(dark)],
    [blankCell(white), textCell('#', header('CENTER')), bilingualCell(T.award, header('LEFT'), COLORS.mutedOnDark), bilingualCell(T.awardWinner, header('LEFT'), COLORS.mutedOnDark), blankCell(white)],
    ...lines.map((label, index) => [
      blankCell(white),
      numberCell(index + 1, cellFmt('CENTER', { color: COLORS.muted, size: 9 })),
      label ? textCell(label, cellFmt('LEFT', { bold: true })) : blankCell(cellFmt('LEFT', { bold: true })),
      blankCell(cellFmt('LEFT', { color: COLORS.goldText, bold: true })),
      blankCell(white)
    ])
  ];
  const firstLine = 3;

  return {
    sheet: {
      properties: {
        sheetId: AWARDS_ID,
        title: T.awardsTab,
        gridProperties: { rowCount: rows.length + 3, columnCount: 5, frozenRowCount: 3, hideGridlines: true },
        tabColorStyle: { rgbColor: rgb(COLORS.goldMid) }
      },
      data: [{
        startRow: 0,
        startColumn: 0,
        rowData: rows.map(values => ({ values })),
        rowMetadata: [56, 36, 42, ...lines.map(() => 34)].map(pixelSize => ({ pixelSize })),
        columnMetadata: [{ pixelSize: 16 }, { pixelSize: 48 }, { pixelSize: 340 }, { pixelSize: 300 }, { pixelSize: 16 }]
      }],
      merges: [gridRange(AWARDS_ID, 0, 1, 1, 4), gridRange(AWARDS_ID, 1, 2, 1, 4)],
      protectedRanges: [lockSheet(AWARDS_ID, [gridRange(AWARDS_ID, firstLine, firstLine + lines.length, 2, 4)])]
    },
    validations: [{
      setDataValidation: {
        range: gridRange(AWARDS_ID, firstLine, firstLine + lines.length, 3, 4),
        rule: {
          condition: { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: `=${quoteSheet(firstPhaseName.toUpperCase())}!$C$5:$C$${4 + rowCount}` }] },
          strict: false,
          showCustomUi: true
        }
      }
    }]
  };
}

export const DEFAULT_GOOGLE_PHASES = [
  { name: 'Opening', qualify: 15 },
  { name: 'Swimsuit', qualify: 10 },
  { name: 'Evening Gown', qualify: 5 },
  { name: 'Q&A', qualify: 5 }
];

export const DEFAULT_AWARDS = ['Best in National Costume', 'Best in Introduction', 'Best in Preliminaries - Swim', 'Best in Preliminaries - EG'];

export function buildGoogleSpreadsheet({ title, judgeNames, delegates = [], maxScore = 10, phases = DEFAULT_GOOGLE_PHASES, awards = DEFAULT_AWARDS }) {
  const rowCount = Math.max(50, delegates.length + 10);
  const sheets = [buildSetupSheet({ title, judgeNames, maxScore })];
  const validations = [];

  phases.forEach((phase, index) => {
    const built = buildPhaseSheet({
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
    validations.push(...built.validations);
  });

  const awardsSheet = buildAwardsSheet({ awards, firstPhaseName: phases[0].name, rowCount });
  awardsSheet.sheet.properties.index = phases.length + 1;
  sheets.push(awardsSheet.sheet);
  validations.push(...awardsSheet.validations);

  return {
    createBody: {
      // en_US keeps formula syntax (commas, dot decimals) predictable for every viewer.
      properties: { title: `${title} · Scoresheet`, locale: 'en_US' },
      sheets
    },
    batchRequests: validations
  };
}
