

  // Государственные праздники РФ (фиксированные даты + новогодние каникулы)
  function isPublicHoliday(iso){
    const md = iso.slice(5); // MM-DD
    if (md >= '01-01' && md <= '01-08') return true; // 1–8 января
    if (md === '02-23') return true;
    if (md === '03-08') return true;
    if (md === '05-01') return true;
    if (md === '05-09') return true;
    if (md === '06-12') return true;
    if (md === '11-04') return true;
    return false;
  }
window.__APP_OK__ = true;
(async () => {
  const LS_KEY = 'kalendar_v1';
  const PRESS_MS = 450; // long-press

  const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

  // Soft base tones (used only as background fill in day list rows)
  const COLORS = [
    '#E58D8D','#F2A68B','#E7C48A','#F1E08A',
    '#8FE2C3','#A9E39A','#8EC9F6','#9ADCF2',
    '#B7A7F6','#D0A4F2','#F2A7C6','#BFC6D1'
  ];

  // Not exhaustive (you can paste any emoji into title too), but good starter list:
  const EMOJI_ALL = ['🏥','🎤','🏖️','❤️','🛫','🛬','🔥','💃🏾','🎶','🥳','🤓','🤑','🏃🏼‍➡️','👩‍❤️‍💋‍👨','🪡','🐒','💥','🌊','🍗','🍺','🍽️','⚽️','🏀','🥎','🎹','🚕','📸','☎️','💰','⌛️','🛠️','💊','🩸','🖌️','📍','🦷','⚙️','🏋️','🏠','☕️','🧠'];

  // --- Storage (IndexedDB) ---
  const DB_NAME = 'kalendar_db';
  const DB_STORE = 'kv';
  const DB_KEY_STATE = 'state';

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB not supported'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    });
  }

  async function idbGet(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const store = tx.objectStore(DB_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error || new Error('IndexedDB get failed'));
    });
  }

  async function idbSet(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      const req = store.put(value, key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error || new Error('IndexedDB set failed'));
    });
  }

  function normalizeState(s) {
    const out = (s && typeof s === 'object') ? s : {};
    out.events ||= [];
    out.hidden ||= [];
    out.birthdays ||= [];
    out.vacations ||= [];
    out.emojiFreq ||= {};
    out.settings ||= { gridlines: 'white' };
    return out;
  }

  async function loadState() {
    // 1) IndexedDB
    try {
      const s = await idbGet(DB_KEY_STATE);
      if (s) return normalizeState(s);
    } catch (e) {}

    // 2) Migrate from old localStorage
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) throw new Error('no state');
      const norm = normalizeState(JSON.parse(raw));
      try {
        await idbSet(DB_KEY_STATE, norm);
        localStorage.removeItem(LS_KEY);
      } catch (e) {}
      return norm;
    } catch (e) {
      return normalizeState(null);
    }
  }

  const state = await loadState();

  let _saveTimer = null;
  function flushSave() {
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    idbSet(DB_KEY_STATE, state).catch(async () => {
      // last resort fallback
      try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch(e) {}
    });
  }
  function saveState() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(flushSave, 80);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });
// --- Date helpers ---
  const pad2 = (n) => String(n).padStart(2,'0');
  const toISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const parseISODate = (iso) => { const [y,m,dd]=iso.split('-').map(Number); return new Date(y, m-1, dd); };
  const formatRu = (iso) => { const d=parseISODate(iso); return `${pad2(d.getDate())}.${pad2(d.getMonth()+1)}.${d.getFullYear()}`; };
  const ruDayTitle = (iso) => {
    const d = parseISODate(iso);
    const wd = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'][d.getDay()];
    return `${wd}, ${formatRu(iso)}`;
  };
  const isLeapYear = (y) => (y%4===0 && y%100!==0) || (y%400===0);
  const normalizeFeb29 = (y, m, day) => (m===2 && day===29 && !isLeapYear(y)) ? ({m:2, day:28}) : ({m, day});

  // --- Special (national) days shown only in day list (no calendar icons) ---
  function orthodoxEasterISO(year){
    // Julian algorithm -> Gregorian (+13 days for 1900-2099)
    const a = year % 4;
    const b = year % 7;
    const c = year % 19;
    const d = (19*c + 15) % 30;
    const e = (2*a + 4*b + 6*d + 6) % 7;
    let day = d + e + 13; // March base (Julian)
    let month = 3;
    if (day > 31) { day -= 31; month = 4; }
    const jul = new Date(year, month-1, day);
    jul.setDate(jul.getDate() + 13);
    return toISODate(jul);
  }

  function thirdSundayOfJuneISO(year){
    const d = new Date(year, 5, 1);
    while (d.getDay() !== 0) d.setDate(d.getDate()+1);
    d.setDate(d.getDate() + 14);
    return toISODate(d);
  }

  function specialEventsForDate(dateISO){
    const y = parseInt(dateISO.slice(0,4),10);
    const mmdd = dateISO.slice(5);
    const out = [];

    const fixed = {
      '01-01':'Новый год',
      '01-07':'Рождество',
      '01-25':'Татьянин день',
      '02-14':'День всех влюблённых',
      '02-23':'День защитника Отечества',
      '03-08':'Международный женский день',
      '04-01':'День смеха',
      '05-01':'День труда',
      '05-09':'День Победы',
      '06-12':'День России',
      '10-02':'День уролога',
      '11-04':'День народного единства'
    };
    if (fixed[mmdd]) out.push(fixed[mmdd]);

    const easter = orthodoxEasterISO(y);
    const easterDate = parseISODate(easter);

    const palm = new Date(easterDate); palm.setDate(palm.getDate()-7);
    const maslenitsa = new Date(easterDate); maslenitsa.setDate(maslenitsa.getDate()-56);
    const forgive = new Date(easterDate); forgive.setDate(forgive.getDate()-49);

    if (dateISO === toISODate(maslenitsa)) out.push('Первый день Масленицы');
    if (dateISO === toISODate(palm)) out.push('Вербное воскресенье');
    if (dateISO === toISODate(forgive)) out.push('Прощёное воскресенье');
    if (dateISO === easter) out.push('Пасха');

    const med = thirdSundayOfJuneISO(y);
    if (dateISO === med) out.push('День медицинского работника');

    return out;
  }

  const inRange = (dateISO, startISO, endISO) => !endISO ? dateISO===startISO : (dateISO>=startISO && dateISO<=endISO);

  // --- Holidays (MVP) ---
  // Weekend highlight + basic fixed-date RU holidays for 2026.
  // If you want full production-calendar transfers later, we’ll add a per-year JSON table.
  const HOLIDAYS_RU = {
    '2026': [
      '2026-01-01','2026-01-02','2026-01-03','2026-01-04','2026-01-05','2026-01-06','2026-01-07','2026-01-08',
      '2026-02-23','2026-03-08','2026-05-01','2026-05-09','2026-06-12','2026-11-04'
    ]
  };
  const isWeekend = (d) => d.getDay()===6 || d.getDay()===0;
  const isHoliday = (iso) => (HOLIDAYS_RU[iso.slice(0,4)] || []).includes(iso);
  const shouldHighlightCell = (iso, isTail) => {
    if (isTail) return false; // tails always gray
    const d = parseISODate(iso);
    // Розовая подложка как у выходных: выходные + нерабочие дни (по производственному календарю)
    return isWeekend(d) || isHoliday(iso);
  };

  // --- DOM ---
  const grid = document.getElementById('grid');
  const monthLabel = document.getElementById('monthLabel');
  const yearLabel = document.getElementById('yearLabel');
  const prevMonthBtn = document.getElementById('prevMonth');
  const nextMonthBtn = document.getElementById('nextMonth');
  const monthBtn = document.getElementById('monthBtn');
  const yearBtn = document.getElementById('yearBtn');
  const homeBtn = document.getElementById('homeBtn');
  const dayTitle = document.getElementById('dayTitle');
  const dayList = document.getElementById('dayList');

  const overlayBackdrop = document.getElementById('overlayBackdrop');
  const monthPicker = document.getElementById('monthPicker');
  const datePickerModal = document.getElementById('datePickerModal');
  const dpPrev = document.getElementById('dpPrev');
  const dpNext = document.getElementById('dpNext');
  const dpGrid = document.getElementById('dpGrid');
  const dpMonthLabel = document.getElementById('dpMonthLabel');
  const dpYearLabel = document.getElementById('dpYearLabel');
  const yearPicker = document.getElementById('yearPicker');
  const monthsGrid = document.getElementById('monthsGrid');
  const yearList = document.getElementById('yearList');

  const addBtn = document.getElementById('addBtn');
  const settingsBtn = document.getElementById('settingsBtn');

  // Event modal
  const eventModal = document.getElementById('eventModal');
  const cancelEventBtn = document.getElementById('cancelEventBtn');
  const saveEventBtn = document.getElementById('saveEventBtn');
  const eventModalTitle = document.getElementById('eventModalTitle');
  const emojiBtn = document.getElementById('emojiBtn');
  const emojiPreview = document.getElementById('emojiPreview');
  const titleInput = document.getElementById('titleInput');
  const colorBtn = document.getElementById('colorBtn');
  const colorPreview = document.getElementById('colorPreview');
  const startDateBtn = document.getElementById('startDateBtn');
  const endDateBtn = document.getElementById('endDateBtn');
  const addRangeBtn = document.getElementById('addRangeBtn');
  const timeInput = document.getElementById('timeInput');

  // Emoji picker
  const emojiPicker = document.getElementById('emojiPicker');
  const closeEmojiBtn = document.getElementById('closeEmojiBtn');
  const emojiFrequent = document.getElementById('emojiFrequent');
  const emojiAll = document.getElementById('emojiAll');

  // Color picker
  const colorPicker = document.getElementById('colorPicker');
  const closeColorBtn = document.getElementById('closeColorBtn');
  const colorGrid = document.getElementById('colorGrid');

  // Settings
  const settingsModal = document.getElementById('settingsModal');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importInput = document.getElementById('importInput');
  const aboutBtn = document.getElementById('aboutBtn');
  const searchBtn = document.getElementById('searchBtn');
  const hiddenBtn = document.getElementById('hiddenBtn');
  const birthdaysBtn = document.getElementById('birthdaysBtn');
  const vacationsBtn = document.getElementById('vacationsBtn');

  // Search
  const searchModal = document.getElementById('searchModal');
  const closeSearchBtn = document.getElementById('closeSearchBtn');
  const searchEmojiBtn = document.getElementById('searchEmojiBtn');
  const searchEmojiPreview = document.getElementById('searchEmojiPreview');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const searchList = document.getElementById('searchList');

  // Hidden
  const hiddenModal = document.getElementById('hiddenModal');
  const closeHiddenBtn = document.getElementById('closeHiddenBtn');
  const hiddenList = document.getElementById('hiddenList');

  // Birthdays
  const birthdaysModal = document.getElementById('birthdaysModal');
  const closeBirthdaysBtn = document.getElementById('closeBirthdaysBtn');
  const addBirthdayBtn = document.getElementById('addBirthdayBtn');
  const birthdaysList = document.getElementById('birthdaysList');

  const birthdayModal = document.getElementById('birthdayModal');
  const cancelBirthdayBtn = document.getElementById('cancelBirthdayBtn');
  const birthdayModalTitle = document.getElementById('birthdayModalTitle');
  const bdayNameInput = document.getElementById('bdayNameInput');
  const bdayDateInput = document.getElementById('bdayDateInput');
  const saveBirthdayBtn = document.getElementById('saveBirthdayBtn');

  // Vacations
  const vacationsModal = document.getElementById('vacationsModal');
  const closeVacationsBtn = document.getElementById('closeVacationsBtn');
  const addVacationBtn = document.getElementById('addVacationBtn');
  const vacationsList = document.getElementById('vacationsList');
  const vacYearPrev = document.getElementById('vacYearPrev');
  const vacYearNext = document.getElementById('vacYearNext');
  const vacYearBtn = document.getElementById('vacYearBtn');
  const vacYearLabel = document.getElementById('vacYearLabel');

  const vacationModal = document.getElementById('vacationModal');
  const cancelVacationBtn = document.getElementById('cancelVacationBtn');
  const vacationModalTitle = document.getElementById('vacationModalTitle');
  const vacStartBtn = document.getElementById('vacStartBtn');
  const vacEndBtn = document.getElementById('vacEndBtn');
  const saveVacationBtn = document.getElementById('saveVacationBtn');


  // About
  const aboutModal = document.getElementById('aboutModal');
  const closeAboutBtn = document.getElementById('closeAboutBtn');

  const segBtns = Array.from(document.querySelectorAll('.seg-btn'));

  // --- View state ---
  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth(); // 0-11
  let selectedISO = toISODate(today);

  function updateHomeVisibility() {
    const tISO = toISODate(today);
    const show = viewYear !== today.getFullYear() || viewMonth !== today.getMonth() || selectedISO !== tISO;
    homeBtn.style.visibility = show ? 'visible' : 'hidden';
  }

  
  // --- Micro animation (pop) ---
  function popEl(el){
    try{
      if (!el) return;
      el.classList.remove('pop-anim');
      void el.offsetWidth;
      el.classList.add('pop-anim');
      setTimeout(()=>el.classList.remove('pop-anim'), 260);
    }catch(e){}
  }

// --- Overlay helpers ---
  const showBackdrop = () => overlayBackdrop.classList.remove('hidden');
  const hideBackdrop = () => overlayBackdrop.classList.add('hidden');

  function openOverlay(el) { showBackdrop(); el.classList.remove('hidden'); }
  function closeOverlay(el) {
    el.classList.add('hidden');
    if (monthPicker.classList.contains('hidden') && yearPicker.classList.contains('hidden')) hideBackdrop();
  }
  overlayBackdrop.addEventListener('click', () => { closeOverlay(monthPicker); closeOverlay(yearPicker); closeOverlay(datePickerModal); });
  datePickerModal.addEventListener('click', (e) => { if (e.target === datePickerModal) closeOverlay(datePickerModal); });

  // --- Modal helpers ---
  const openModal = (el) => el.classList.remove('hidden');
  const closeModal = (el) => el.classList.add('hidden');

  function tapOutsideClose(modalEl){
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) closeModal(modalEl);
    });
  }

  // --- Month picker ---
  function renderMonthPicker() {
    monthsGrid.innerHTML = '';
    for (let i=0;i<12;i++) {
      const b = document.createElement('button');
      b.className = 'monthCell' + (i===viewMonth ? ' active' : '');
      b.textContent = MONTHS[i];
      b.addEventListener('click', () => {
        viewMonth = i;
        // keep selected day if possible
        const d = parseISODate(selectedISO);
        const max = new Date(viewYear, viewMonth+1, 0).getDate();
        selectedISO = toISODate(new Date(viewYear, viewMonth, Math.min(d.getDate(), max)));
        closeOverlay(monthPicker);
        render();
      });
      monthsGrid.appendChild(b);
    }
  }

  // --- Year picker (short list, scrollable) ---
  function renderYearPicker() {
    yearList.innerHTML = '';
    const start = viewYear - 1;
    const end = viewYear + 1;
    for (let y=start; y<=end; y++) {
      const b = document.createElement('button');
      b.className = 'yearItem' + (y===viewYear ? ' active' : '');
      b.textContent = String(y);
      b.addEventListener('click', () => {
        viewYear = y;
        const d = parseISODate(selectedISO);
        const max = new Date(viewYear, viewMonth+1, 0).getDate();
        selectedISO = toISODate(new Date(viewYear, viewMonth, Math.min(d.getDate(), max)));
        closeOverlay(yearPicker);
        render();
      });
      yearList.appendChild(b);
    }
    // scroll so current year is around center
    const idx = viewYear - start;
    const itemH = 58; // approx incl margin
    yearList.scrollTop = Math.max(0, (idx-1) * itemH);
  }

  monthBtn.addEventListener('click', () => { renderMonthPicker(); openOverlay(monthPicker); });
  yearBtn.addEventListener('click', () => { renderYearPicker(); openOverlay(yearPicker); });

  // --- Top nav ---
  prevMonthBtn.addEventListener('click', () => {
    viewMonth -= 1;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
    const d = parseISODate(selectedISO);
    const max = new Date(viewYear, viewMonth+1, 0).getDate();
    selectedISO = toISODate(new Date(viewYear, viewMonth, Math.min(d.getDate(), max)));
    render();
  });
  nextMonthBtn.addEventListener('click', () => {
    viewMonth += 1;
    if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    const d = parseISODate(selectedISO);
    const max = new Date(viewYear, viewMonth+1, 0).getDate();
    selectedISO = toISODate(new Date(viewYear, viewMonth, Math.min(d.getDate(), max)));
    render();
  });
  homeBtn.addEventListener('click', () => {
    viewYear = today.getFullYear();
    viewMonth = today.getMonth();
    selectedISO = toISODate(today);
    closeOverlay(monthPicker);
    closeOverlay(yearPicker);
    render();
  });

  // --- IDs ---
  const uid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2,9)}${Date.now().toString(36).slice(2,6)}`;

  // --- Native date picker helper (iOS) ---
  function pickDate(currentISO, cb) {
    const inp = document.createElement('input');
    inp.type = 'date';
    inp.value = currentISO;
    inp.style.position='fixed';
    inp.style.left='-2000px';
    document.body.appendChild(inp);
    inp.addEventListener('change', () => {
      cb(inp.value);
      document.body.removeChild(inp);
    });
    inp.click();
  }


  // --- Custom dark date picker (used for event/vacation dates) ---
  let dpYear = today.getFullYear();
  let dpMonth = today.getMonth();
  let dpSelectedISO = toISODate(today);
  let dpOnPick = null;

  function openDatePicker(initialISO, onPick){
    dpSelectedISO = initialISO;
    const d = parseISODate(initialISO);
    dpYear = d.getFullYear();
    dpMonth = d.getMonth();
    dpOnPick = onPick;
    renderDatePicker();
    openOverlay(datePickerModal);
  }

  function renderDatePicker(){
    dpMonthLabel.textContent = MONTHS[dpMonth];
    dpYearLabel.textContent = String(dpYear);
    dpGrid.innerHTML = '';

    const first = new Date(dpYear, dpMonth, 1);
    const firstDow = first.getDay();
    const offset = (firstDow===0 ? 6 : firstDow-1);
    const daysInMonth = new Date(dpYear, dpMonth+1, 0).getDate();
    const prevDays = new Date(dpYear, dpMonth, 0).getDate();

    for (let i=0;i<42;i++){
      let cy=dpYear, cm=dpMonth, day=0, isTail=false;
      if (i < offset) {
        isTail = true;
        day = prevDays - (offset - 1 - i);
        cm = dpMonth - 1; if (cm < 0) { cm=11; cy=dpYear-1; }
      } else if (i >= offset + daysInMonth) {
        isTail = true;
        day = (i - (offset + daysInMonth)) + 1;
        cm = dpMonth + 1; if (cm > 11) { cm=0; cy=dpYear+1; }
      } else {
        day = (i - offset) + 1;
      }
      const iso = toISODate(new Date(cy, cm, day));
      const cell = document.createElement('div');
      cell.className = 'daycell' + (isTail ? ' tail' : '');
      if (iso === dpSelectedISO) cell.classList.add('selected');

      const num = document.createElement('div');
      num.className = 'daynum' + (isTail ? ' tail' : '');
      num.textContent = String(day);
      // Государственные праздники: подсветка номера дня (серый скругленный квадрат)
      if (!isTail && isPublicHoliday(iso)) {
        num.classList.add('holiday');
      }
      cell.appendChild(num);

      cell.addEventListener('click', () => {
        dpSelectedISO = iso;
        if (dpOnPick) {
          closeOverlay(datePickerModal);
          dpOnPick(iso);
        }
      });

      dpGrid.appendChild(cell);
    }
  }

  dpPrev.addEventListener('click', () => {
    dpMonth -= 1;
    if (dpMonth < 0) { dpMonth = 11; dpYear -= 1; }
    renderDatePicker();
  });

  dpNext.addEventListener('click', () => {
    dpMonth += 1;
    if (dpMonth > 11) { dpMonth = 0; dpYear += 1; }
    renderDatePicker();
  });

  // --- Event form ---
  let editingEventId = null;

  function openNewEventModal() {
    editingEventId = null;
    eventModalTitle.textContent = 'Новое событие';
    saveEventBtn.textContent = 'Добавить';
    setValuePreview(emojiPreview, DEFAULT_ICON);
    titleInput.value = '';
    colorPreview.style.background = 'transparent';
    colorPreview.dataset.none = '1';
    startDateBtn.textContent = formatRu(selectedISO);
    endDateBtn.classList.add('hidden');
    endDateBtn.textContent = '';
    addRangeBtn.classList.remove('hidden');
    if (endInputRow) endInputRow.classList.add('hidden');
    if (endDateInput) endDateInput.value = '';
    timeInput.value = '';
    openModal(eventModal);
  }

  function openEditEventModal(ev) {
    editingEventId = ev.id;
    eventModalTitle.textContent = 'Редактировать';
    saveEventBtn.textContent = 'Сохранить';
    setValuePreview(emojiPreview, ev.emoji || DEFAULT_ICON);
    titleInput.value = ev.title || '';
    if (ev.color) { colorPreview.style.background = ev.color; colorPreview.dataset.none = '0'; }
    else { colorPreview.style.background = 'transparent'; colorPreview.dataset.none = '1'; }
    startDateBtn.textContent = formatRu(ev.start);
    if (ev.end) {
      endDateBtn.classList.remove('hidden');
      endDateBtn.textContent = `По: ${formatRu(ev.end)}`;
      addRangeBtn.classList.add('hidden');
      if (endInputRow) endInputRow.classList.remove('hidden');
      if (endDateInput) endDateInput.value = ev.end;
    } else {
      endDateBtn.classList.add('hidden');
      endDateBtn.textContent = '';
      addRangeBtn.classList.remove('hidden');
      if (endInputRow) endInputRow.classList.add('hidden');
      if (endDateInput) endDateInput.value = '';
    if (endInputRow) endInputRow.classList.add('hidden');
    if (endDateInput) endDateInput.value = '';
    }
    timeInput.value = ev.time || '';
    openModal(eventModal);
  }

  cancelEventBtn.addEventListener('click', () => closeModal(eventModal));

  addRangeBtn.addEventListener('click', () => {
    const startISO = getStartISO();
    endDateBtn.classList.remove('hidden');
    endDateBtn.textContent = `По: ${formatRu(startISO)}`;
    addRangeBtn.classList.add('hidden');
    pickDate(startISO, (iso) => {
      const start = getStartISO();
      const end = iso < start ? start : iso;
      endDateBtn.textContent = `По: ${formatRu(end)}`;
    });
  });

  function getStartISO(){
    const [dd,mm,yy] = startDateBtn.textContent.trim().split('.').map(Number);
    return `${yy}-${pad2(mm)}-${pad2(dd)}`;
  }
  function getEndISOOrNull(){
    // Prefer real date input (works on iOS PWA)
    if (endDateInput && endInputRow && !endInputRow.classList.contains('hidden')) {
      return endDateInput.value || null;
    }
    // Fallback to old button-based parsing
    if (endDateBtn && !endDateBtn.classList.contains('hidden')) {
      const t = endDateBtn.textContent.replace('По:','').trim();
      const [dd,mm,yy] = t.split('.').map(Number);
      if (!yy || !mm || !dd) return null;
      return `${yy}-${pad2(mm)}-${pad2(dd)}`;
    }
    return null;
  }

  startDateBtn.addEventListener('click', () => {
    const cur = getStartISO() || selectedISO;
    pickDate(cur, (iso) => {
      const end = getEndISOOrNull();
      if (end && iso > end) {
        // swap
        startDateBtn.textContent = formatRu(end);
        endDateBtn.textContent = `По: ${formatRu(iso)}`;
      } else {
        startDateBtn.textContent = formatRu(iso);
      }
    });
  });
  endDateBtn.addEventListener('click', () => {
    const startISO = getStartISO();
    const cur = getEndISOOrNull() || startISO;
    pickDate(cur, (iso) => {
      const end = iso < startISO ? startISO : iso;
      endDateBtn.textContent = `По: ${formatRu(end)}`;
    });
  });

  saveEventBtn.addEventListener('click', () => {
    const emoji = (emojiPreview.dataset.value || DEFAULT_ICON);
    const title = titleInput.value.trim();
    if (!title) { titleInput.focus(); return; }
    const color = (colorPreview.dataset.none === '1') ? null : (rgbToHex(getComputedStyle(colorPreview).backgroundColor) || null);
    const start = getStartISO();
    const end = getEndISOOrNull();
    const time = timeInput.value ? timeInput.value : null;

    if (editingEventId) {
      const ev = state.events.find(e => e.id===editingEventId);
      if (ev) { ev.emoji=emoji; ev.title=title; ev.color=color; ev.start=start; ev.end=end; ev.time=time; }
    } else {
      state.events.push({ id: uid('ev'), emoji, title, color, start, end, time });
    }
    state.emojiFreq[emoji] = (state.emojiFreq[emoji]||0) + 1;
    saveState();
    closeModal(eventModal);
    render();
  });

  function hexToRgba(hex, a){
    const h = String(hex).replace('#','');
    if (h.length !== 6) return hex;
    const r = parseInt(h.slice(0,2),16);
    const g = parseInt(h.slice(2,4),16);
    const b = parseInt(h.slice(4,6),16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function rgbToHex(rgb){
    const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return null;
    const r = Number(m[1]).toString(16).padStart(2,'0');
    const g = Number(m[2]).toString(16).padStart(2,'0');
    const b = Number(m[3]).toString(16).padStart(2,'0');
    return `#${r}${g}${b}`.toUpperCase();
  }

  
  // --- Custom icons (PNG pack) ---
  const ICON_VALUE_PREFIX = 'ic:';
  const ICON_IDS = ['mic', 'book', 'beach', 'bed', 'plane', 'money', 'soccer', 'puck', 'walk', 'dance', 'beers', 'cutlery', 'coffee', 'piano', 'syringe', 'pen', 'car', 'home', 'dacha', 'taxi', 'bus', 'snow', 'cinema', 'sun', 'phone', 'cart', 'train', 'heart', 'notebook', 'picnic', 'tooth'];
  const DEFAULT_ICON = ICON_VALUE_PREFIX + 'plane';

  function isIconValue(v){ return typeof v === 'string' && v.startsWith(ICON_VALUE_PREFIX); }
  function iconIdFromValue(v){ return isIconValue(v) ? v.slice(ICON_VALUE_PREFIX.length) : null; }
  function iconSrcByValue(v){
    const id = iconIdFromValue(v);
    if (!id) return null;
    return `assets/event-icons/${id}.png`;
  }

  function makeValueNode(v, cls){
    if (isIconValue(v)){
      const img = document.createElement('img');
      img.className = ((cls || '') + ' eventIcon').trim();
      img.src = iconSrcByValue(v) || '';
      img.alt = '';
      img.draggable = false;
      return img;
    }
    const sp = document.createElement('span');
    sp.className = cls || 'emoji';
    sp.textContent = v || '•';
    return sp;
  }

  function setValuePreview(el, v){
    if (!el) return;
    const val = v || DEFAULT_ICON;
    el.dataset.value = val;
    el.innerHTML = '';
    el.appendChild(makeValueNode(val, 'emojiBtn'));
  }

// --- Emoji picker ---
  function topFrequent(n=12){
    const entries = Object.entries(state.emojiFreq).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
    const defaults = ['✅','🔥','💪','📌','🎯','🚗','🏠','🍽️','💼','🎉','❤️','📞'];
    const seen = new Set();
    const out = [];
    [...entries, ...defaults].forEach(e => {
      if (out.length>=n) return;
      if (!seen.has(e)) { seen.add(e); out.push(e); }
    });
    return out;
  }
  function renderEmojiPicker(onPick){
    // Icons-only picker (PNG pack)
    emojiFrequent.innerHTML = '';
    emojiAll.innerHTML = '';

    ICON_IDS.forEach(id => {
      const v = ICON_VALUE_PREFIX + id;
      const b = document.createElement('button');
      b.className = 'emoji-btn';
      b.appendChild(makeValueNode(v, 'emojiBtn'));
      b.addEventListener('click', () => {
        popEl(b);
        onPick(v);
      });
      emojiAll.appendChild(b);
    });
  }

  emojiBtn.addEventListener('click', () => {
    renderEmojiPicker((v) => {
      setValuePreview(emojiPreview, v);
      closeModal(emojiPicker);
    });
    openModal(emojiPicker);
  });
  closeEmojiBtn.addEventListener('click', () => closeModal(emojiPicker));

  // --- Color picker ---
  function renderColorPicker(){
    colorGrid.innerHTML = '';

    // none
    {
      const b = document.createElement('button');
      b.className = 'color-btn';
      const s = document.createElement('div');
      s.className = 'color-swatch';
      s.style.background = 'transparent';
      s.style.borderStyle = 'dashed';
      b.appendChild(s);
      b.addEventListener('click', () => {
        colorPreview.style.background = 'transparent';
        colorPreview.dataset.none = '1';
        closeModal(colorPicker);
      });
      colorGrid.appendChild(b);
    }

    COLORS.forEach(c => {
      const b = document.createElement('button');
      b.className = 'color-btn';
      const s = document.createElement('div');
      s.className = 'color-swatch';
      s.style.background = c;
      b.appendChild(s);
      b.addEventListener('click', () => {
        colorPreview.style.background = c;
        colorPreview.dataset.none = '0';
        closeModal(colorPicker);
      });
      colorGrid.appendChild(b);
    });
  }

  colorBtn.addEventListener('click', () => { renderColorPicker(); openModal(colorPicker); });
  closeColorBtn.addEventListener('click', () => closeModal(colorPicker));

  // --- Hidden occurrences ---
  const hiddenKey = (type, refId, dateISO) => `${type}|${refId}|${dateISO}`;
  const isHidden = (type, refId, dateISO) => state.hidden.some(h => h.type===type && h.refId===refId && h.dateISO===dateISO);
  const hideOcc = (type, refId, dateISO) => {
    if (isHidden(type, refId, dateISO)) return;
    state.hidden.push({ type, refId, dateISO, key: hiddenKey(type, refId, dateISO) });
    saveState();
  };
  const unhideOcc = (type, refId, dateISO) => {
    state.hidden = state.hidden.filter(h => !(h.type===type && h.refId===refId && h.dateISO===dateISO));
    saveState();
  };

  // --- Occurrences for day ---
  function occurrencesForDate(dateISO){
    const d = parseISODate(dateISO);
    const y = d.getFullYear();
    const m = d.getMonth()+1;
    const day = d.getDate();

    const bdaysAll = state.birthdays
      .filter(b => {
        const n = normalizeFeb29(y, b.month, b.day);
        return n.m===m && n.day===day;
      })
      .map(b => ({ type:'bday', refId:b.id, emoji:'🎂', title:b.name, dateISO }));

    const evsAll = state.events
      .filter(e => inRange(dateISO, e.start, e.end))
      .map(e => ({ type:'event', refId:e.id, emoji:e.emoji, title:e.title, time:e.time, color:e.color, dateISO }));

    const bdaysVisible = bdaysAll.filter(o => !isHidden('bday', o.refId, dateISO));
    const evsVisible = evsAll.filter(o => !isHidden('event', o.refId, dateISO));
    return { bdaysAll, bdaysVisible, evsAll, evsVisible };
  }

  // --- Swipe & long-press ---
  function attachLongPress(el, onPress) {
    let t = null;
    let moved = false;
    el.addEventListener('touchstart', () => {
      moved = false;
      t = setTimeout(() => { t=null; if (!moved) onPress(); }, PRESS_MS);
    }, {passive:true});
    el.addEventListener('touchmove', () => { moved=true; if (t){clearTimeout(t); t=null;} }, {passive:true});
    el.addEventListener('touchend', () => { if (t){clearTimeout(t); t=null;} }, {passive:true});
  }

  // swipe left = reveal delete button; swipe right = do action immediately (hide/restore)
  function makeSwipeRow(contentEl, onDelete, onRight, opts={}){
    const wrap = document.createElement('div');
    wrap.className = 'swipeWrap';

    const inner = contentEl.classList.contains('swipeInner') ? contentEl : document.createElement('div');
    if (!contentEl.classList.contains('swipeInner')) {
      inner.className = 'swipeInner';
      inner.appendChild(contentEl);
    }
    wrap.appendChild(inner);

    let deleteBtn = null;
    if (!opts.disableDelete && onDelete) {
      deleteBtn = document.createElement('div');
      deleteBtn.className = 'deleteBtn';
      deleteBtn.innerHTML = `<span>${opts.deleteLabel || 'Удалить'}</span>`;
      deleteBtn.addEventListener('click', () => onDelete());
      wrap.appendChild(deleteBtn);
    }

    const threshold = 40;
    const maxLeft = deleteBtn ? -84 : 0;
    let startX=0, startY=0, dx=0, active=false;

    inner.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY; dx=0; active=true;
    }, {passive:true});

    inner.addEventListener('touchmove', (e) => {
      if (!active) return;
      const t = e.touches[0];
      dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) < Math.abs(dy)) return; // mostly vertical scroll
      if (dx < 0 && deleteBtn) {
        const x = Math.max(maxLeft, dx);
        inner.style.transform = `translateX(${x}px)`;
      }
    }, {passive:true});

    inner.addEventListener('touchend', () => {
      if (!active) return;
      active = false;

      if (dx > threshold && onRight) {
        inner.style.transform = 'translateX(0px)';
        onRight();
        return;
      }
      if (dx < -threshold && deleteBtn) {
        inner.style.transform = `translateX(${maxLeft}px)`;
      } else {
        inner.style.transform = 'translateX(0px)';
      }
    }, {passive:true});

    // tap row closes delete reveal
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('.deleteBtn')) return;
      if (inner.style.transform && inner.style.transform !== 'translateX(0px)') inner.style.transform = 'translateX(0px)';
    });

    return wrap;
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // --- Day panel render ---
  function renderDayPanel(){
    dayTitle.textContent = ruDayTitle(selectedISO);
    dayList.innerHTML = '';

    const { bdaysVisible, evsVisible } = occurrencesForDate(selectedISO);

    // Birthdays first
    bdaysVisible.forEach(b => {
      const row = document.createElement('div');
      row.className = 'bdayRow';
      row.textContent = `🎂 ${b.title}`;
      // swipe right = hide this birthday occurrence
      const wrap = makeSwipeRow(row, null, () => { hideOcc('bday', b.refId, selectedISO); render(); }, { disableDelete:true });
      dayList.appendChild(wrap);
    });

    // Events (sort by time, then title)
    const sorted = [...evsVisible].sort((a,b)=> {
      if (a.time && b.time) return a.time.localeCompare(b.time);
      if (a.time && !b.time) return -1;
      if (!a.time && b.time) return 1;
      return a.title.localeCompare(b.title);
    });

    sorted.forEach(o => {
      const inner = document.createElement('div');
      inner.className = 'swipeInner';
      if (o.color) inner.style.background = hexToRgba(o.color, 0.2);
      else inner.classList.add('nocolor');

      const row = document.createElement('div');
      row.className = 'eventRow';
      // build row
      const emojiDiv = document.createElement('div');
      emojiDiv.className = 'emoji';
      emojiDiv.appendChild(makeValueNode(o.emoji));
      row.appendChild(emojiDiv);

      if (o.time) {
        const timeDiv = document.createElement('div');
        timeDiv.className = 'time';
        timeDiv.textContent = o.time;
        row.appendChild(timeDiv);
      }

      const titleDiv = document.createElement('div');
      titleDiv.className = 'title';
      titleDiv.textContent = o.title;
      row.appendChild(titleDiv);

      inner.appendChild(row);

      // long press = edit
      attachLongPress(inner, () => {
        const ev = state.events.find(e => e.id===o.refId);
        if (ev) openEditEventModal(ev);
      });

      // swipe left delete event (entire), swipe right hide occurrence
      const wrap = makeSwipeRow(inner,
        () => {
          state.events = state.events.filter(e => e.id !== o.refId);
          state.hidden = state.hidden.filter(h => !(h.type==='event' && h.refId===o.refId));
          saveState();
          render();
        },
        () => { hideOcc('event', o.refId, selectedISO); render(); }
      );

      dayList.appendChild(wrap);
    });

    // Special days (national calendar) in list, no calendar icons
    const specials = specialEventsForDate(selectedISO);
    specials.forEach(name => {
      const row = document.createElement('div');
      row.className = 'bdayRow past';
      row.textContent = name;
      dayList.appendChild(row);
    });

    if (!bdaysVisible.length && !evsVisible.length && specials.length===0) {
      const empty = document.createElement('div');
      empty.style.opacity = '0.7';
      empty.style.padding = '10px 2px';
      empty.textContent = 'Нет событий';
      dayList.appendChild(empty);
    }
  }

  // --- Calendar grid render ---
  function renderGrid(){
    monthLabel.textContent = MONTHS[viewMonth];
    yearLabel.textContent = String(viewYear);
    updateHomeVisibility();
    grid.classList.toggle('gridlines-gray', state.settings.gridlines === 'gray');

    grid.innerHTML = '';

    const first = new Date(viewYear, viewMonth, 1);
    const firstDow = first.getDay(); // 0=Sun..6=Sat
    const offset = (firstDow===0 ? 6 : firstDow-1); // Monday-first
    const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();
    const prevDays = new Date(viewYear, viewMonth, 0).getDate();
    const todayISO = toISODate(new Date());

    for (let i=0;i<42;i++){
      let cellYear=viewYear, cellMonth=viewMonth, day=0, isTail=false;

      if (i < offset) {
        isTail = true;
        day = prevDays - (offset - 1 - i);
        cellMonth = viewMonth - 1;
        if (cellMonth < 0) { cellMonth = 11; cellYear = viewYear - 1; }
      } else if (i >= offset + daysInMonth) {
        isTail = true;
        day = (i - (offset + daysInMonth)) + 1;
        cellMonth = viewMonth + 1;
        if (cellMonth > 11) { cellMonth = 0; cellYear = viewYear + 1; }
      } else {
        day = (i - offset) + 1;
      }

      const iso = toISODate(new Date(cellYear, cellMonth, day));
      const cell = document.createElement('div');
      cell.className = 'daycell' + (isTail ? ' tail' : '');
      if (iso === selectedISO) cell.classList.add('selected');
      if (!isTail && iso === todayISO) cell.classList.add('today');
      if (!isTail && inVacations(iso)) cell.classList.add('vac');
      if (shouldHighlightCell(iso, isTail)) cell.classList.add('hilite');

      const num = document.createElement('div');
      num.className = 'daynum' + (isTail ? ' tail' : '');
      num.textContent = String(day);
      // Государственные праздники: подсветка номера дня (серый скруглённый квадрат)
      if (!isTail && (isPublicHoliday(iso) || (isHoliday(iso) && !isWeekend(parseISODate(iso))))) {
        num.classList.add('holiday');
      }
      cell.appendChild(num);

      const occ = occurrencesForDate(iso);

      // Birthday marker: show if there is at least 1 visible birthday that day.
      if (occ.bdaysVisible.length > 0) {
        const b = document.createElement('div');
        b.className = 'bdayMark' + (isTail ? ' muted' : '');
        b.textContent = '🎂';
        cell.appendChild(b);
      }

      // Event icons in cell (max 2 + ..), hidden occurrences are not shown
      const icons = document.createElement('div');
      icons.className = 'icons';
      const visibleEvs = occ.evsAll.filter(e => !isHidden('event', e.refId, iso));

      visibleEvs.slice(0,2).forEach((o, idx) => {
        const node = makeValueNode(o.emoji);
        if (idx >= 1) node.classList.add('small'); // second icon slightly smaller
        if (isTail) node.classList.add('muted');
        icons.appendChild(node);
      });

      if (visibleEvs.length > 2) {
        const dots = document.createElement('span');
        dots.className = 'dots' + (isTail ? ' muted' : '');
        dots.textContent = '..';
        icons.appendChild(dots);
      }
      cell.appendChild(icons);

      cell.addEventListener('click', () => {
        const clicked = parseISODate(iso);
        viewYear = clicked.getFullYear();
        viewMonth = clicked.getMonth();
        selectedISO = iso;
        render();
      });

      grid.appendChild(cell);
    }
  }

  // --- Search ---
  let searchEmoji = null;

  function otherIconsForDay(dateISO, excludeRefId){
    const { evsAll } = occurrencesForDate(dateISO);
    const others = evsAll.filter(e => e.refId !== excludeRefId && !isHidden('event', e.refId, dateISO));
    return { icons: others.slice(0,3).map(o=>o.emoji), more: others.length>3 };
  }

  function renderSearch(){
    const q = searchInput.value.trim().toLowerCase();
    const tISO = toISODate(today);
    const results = [];

    // search window: 1 year назад/вперёд
    const start = new Date(today.getFullYear()-1, today.getMonth(), today.getDate());
    const end = new Date(today.getFullYear()+1, today.getMonth(), today.getDate());

    for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)){
      const iso = toISODate(d);
      const occ = occurrencesForDate(iso);

      // birthdays
      occ.bdaysVisible.forEach(b => {
        if (searchEmoji && searchEmoji !== '🎂') return;
        if (q && !b.title.toLowerCase().includes(q)) return;
        results.push({ type:'bday', refId:b.refId, emoji:'🎂', title:b.title, dateISO: iso, start:null, end:null });
      });

      // events occurrences
      state.events.forEach(e => {
        if (!inRange(iso, e.start, e.end)) return;
        if (isHidden('event', e.id, iso)) return;
        if (searchEmoji && e.emoji !== searchEmoji) return;
        if (q && !e.title.toLowerCase().includes(q)) return;
        results.push({ type:'event', refId:e.id, emoji:e.emoji, title:e.title, dateISO: iso, start:e.start, end:e.end });
      });
    }

    const upcoming = results.filter(r => r.dateISO >= tISO).sort((a,b)=> a.dateISO.localeCompare(b.dateISO));
    const past = results.filter(r => r.dateISO < tISO).sort((a,b)=> b.dateISO.localeCompare(a.dateISO));

    searchList.innerHTML = '';

    function addRow(r, isPast){
      const row = document.createElement('div');
      row.className = 'listRow' + (isPast ? ' past' : '');

      const left = document.createElement('div');
      left.className = 'left';

      // left side: date/range + icon + title
      const textSpan = document.createElement('span');
      textSpan.className = 'leftText';

      if (r.type==='event') {
        const iconNode = makeValueNode(r.emoji);
        iconNode.classList.add('inlineIcon');
        left.appendChild(iconNode);

        if (r.end) textSpan.textContent = `С: ${formatRu(r.start)} По: ${formatRu(r.end)} — ${r.title}`;
        else textSpan.textContent = `${formatRu(r.dateISO)} — ${r.title}`;
      } else {
        const cake = document.createElement('span');
        cake.className = 'emoji';
        cake.textContent = '🎂';
        left.appendChild(cake);
        textSpan.textContent = `${formatRu(r.dateISO)} — ${r.title}`;
      }

      left.appendChild(textSpan);

      const right = document.createElement('div');
      right.className = 'rightIcons';
      const oi = otherIconsForDay(r.dateISO, r.type==='event' ? r.refId : null);
      oi.icons.forEach(e => {
        const node = makeValueNode(e);
        node.classList.add('mini');
        right.appendChild(node);
      });
      if (oi.more) {
        const s = document.createElement('span');
        s.textContent = '..';
        right.appendChild(s);
      }

      row.appendChild(left);
      row.appendChild(right);

      row.addEventListener('click', () => {
        const d = parseISODate(r.dateISO);
        viewYear = d.getFullYear();
        viewMonth = d.getMonth();
        selectedISO = r.dateISO;
        closeModal(searchModal);
        closeModal(settingsModal);
        render();
      });

      searchList.appendChild(row);
    }

    upcoming.forEach(r => addRow(r, false));
    if (upcoming.length && past.length) {
      const split = document.createElement('div');
      split.className = 'boldSplit';
      searchList.appendChild(split);
    }
    past.forEach(r => addRow(r, true));
  }

  // Search controls
  searchEmojiBtn.addEventListener('click', () => {
    renderEmojiPicker((e) => {
      searchEmoji = e;
      searchEmojiPreview.innerHTML=''; searchEmojiPreview.appendChild(makeValueNode(e));
      closeModal(emojiPicker);
      renderSearch();
    });
    openModal(emojiPicker);
  });
  clearSearchBtn.addEventListener('click', () => {
    searchEmoji = null;
    searchEmojiPreview.textContent = '🔎';
    searchInput.value = '';
    renderSearch();
  });
  searchInput.addEventListener('input', renderSearch);

  // --- Hidden list ---
  function renderHidden(){
    const rows = [...state.hidden].sort((a,b)=> b.dateISO.localeCompare(a.dateISO));
    hiddenList.innerHTML = '';

    if (!rows.length) {
      const empty = document.createElement('div');
      empty.style.opacity='0.7';
      empty.style.padding='10px 2px';
      empty.textContent='Нет скрытых';
      hiddenList.appendChild(empty);
      return;
    }

    rows.forEach(h => {
      const row = document.createElement('div');
      row.className = 'listRow past';

      let label = '';
      let iconVal = null;
      if (h.type==='event') {
        const ev = state.events.find(e => e.id===h.refId);
        iconVal = ev ? ev.emoji : null;
        label = ev ? `${formatRu(h.dateISO)} — ${ev.title}` : `${formatRu(h.dateISO)} — (удалено)`;
      } else {
        const b = state.birthdays.find(x => x.id===h.refId);
        label = `${formatRu(h.dateISO)} — 🎂 ${b ? b.name : '(удалено)'}`;
      }

      row.innerHTML = `<div class="left">${esc(label)}</div><div class="rightIcons"></div>`;
      try{ if (iconVal){ const leftEl = row.querySelector('.left'); if (leftEl){ const n = makeValueNode(iconVal); n.classList.add('inlineIcon'); leftEl.prepend(n); } } }catch(e){}

      // swipe right = restore occurrence; swipe left = remove from hidden list
      const wrap = makeSwipeRow(row,
        () => { state.hidden = state.hidden.filter(x => x.key !== h.key); saveState(); render(); renderHidden(); },
        () => { unhideOcc(h.type, h.refId, h.dateISO); saveState(); render(); renderHidden(); },
        { deleteLabel:'Удалить' }
      );

      hiddenList.appendChild(wrap);
    });
  }

  // --- Birthdays (manual) ---
  let editingBdayId = null;

  function renderBirthdays(){
    birthdaysList.innerHTML = '';
    const sorted = [...state.birthdays].sort((a,b)=> (a.month-b.month) || (a.day-b.day) || a.name.localeCompare(b.name));
    sorted.forEach(b => {
      const row = document.createElement('div');
      row.className = 'listRow';
      row.innerHTML = `<div class="left">🎂 ${esc(b.name)} — ${pad2(b.day)}.${pad2(b.month)}</div><div class="rightIcons"></div>`;

      attachLongPress(row, () => {
        editingBdayId = b.id;
        birthdayModalTitle.textContent = 'Редактировать';
        bdayNameInput.value = b.name;
        const y = viewYear;
        const nd = normalizeFeb29(y, b.month, b.day);
        bdayDateInput.value = `${y}-${pad2(nd.m)}-${pad2(nd.day)}`;
        openModal(birthdayModal);
      });

      const wrap = makeSwipeRow(row,
        () => { state.birthdays = state.birthdays.filter(x => x.id !== b.id); saveState(); render(); renderBirthdays(); },
        null
      );

      birthdaysList.appendChild(wrap);
    });

    if (!sorted.length) {
      const empty = document.createElement('div');
      empty.style.opacity='0.7';
      empty.style.padding='10px 2px';
      empty.textContent='Пока нет записей';
      birthdaysList.appendChild(empty);
    }
  }

  addBirthdayBtn.addEventListener('click', () => {
    editingBdayId = null;
    birthdayModalTitle.textContent = 'Добавить';
    bdayNameInput.value = '';
    const d = parseISODate(selectedISO);
    bdayDateInput.value = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
    openModal(birthdayModal);
  });
  cancelBirthdayBtn.addEventListener('click', () => closeModal(birthdayModal));
  saveBirthdayBtn.addEventListener('click', () => {
    const name = bdayNameInput.value.trim();
    const val = bdayDateInput.value;
    if (!name || !val) { if (!name) bdayNameInput.focus(); return; }
    const d = parseISODate(val);
    const m = d.getMonth()+1;
    const day = d.getDate();

    if (editingBdayId) {
      const b = state.birthdays.find(x => x.id===editingBdayId);
      if (b) { b.name=name; b.month=m; b.day=day; }
    } else {
      state.birthdays.push({ id: uid('bd'), name, month:m, day });
    }
    saveState();
    closeModal(birthdayModal);
    closeModal(birthdaysModal);
    openModal(settingsModal);
    render();
    renderBirthdays();
  });



  // --- Vacations ---
  let vacYear = today.getFullYear();
  let editingVacId = null;

  function inVacations(dateISO){
    return state.vacations.some(v => dateISO >= v.start && dateISO <= v.end);
  }

  function renderVacations(){
    vacYearLabel.textContent = String(vacYear);
    vacationsList.innerHTML = '';
    const list = state.vacations
      .filter(v => v.start.slice(0,4) === String(vacYear) || v.end.slice(0,4) === String(vacYear))
      .sort((a,b)=> a.start.localeCompare(b.start));

    list.forEach(v => {
      const row = document.createElement('div');
      row.className = 'listRow';
      row.innerHTML = `<div class="left">С: ${formatRu(v.start)}  По: ${formatRu(v.end)}</div><div class="rightIcons"></div>`;

      attachLongPress(row, () => {
        editingVacId = v.id;
        vacationModalTitle.textContent = 'Редактировать';
        vacStartBtn.textContent = `С: ${formatRu(v.start)}`;
        vacEndBtn.textContent = `По: ${formatRu(v.end)}`;
        openModal(vacationModal);
      });

      const wrap = makeSwipeRow(row,
        () => { state.vacations = state.vacations.filter(x => x.id !== v.id); saveState(); render(); renderVacations(); },
        null
      );
      vacationsList.appendChild(wrap);
    });

    if (!list.length) {
      const empty = document.createElement('div');
      empty.style.opacity='0.7';
      empty.style.padding='10px 2px';
      empty.textContent='Пока нет отпусков';
      vacationsList.appendChild(empty);
    }
  }

  function getVacStartISO(){
    const t = vacStartBtn.textContent.replace('С:','').trim();
    const [dd,mm,yy] = t.split('.').map(x=>parseInt(x,10));
    return `${yy}-${pad2(mm)}-${pad2(dd)}`;
  }
  function getVacEndISO(){
    const t = vacEndBtn.textContent.replace('По:','').trim();
    const [dd,mm,yy] = t.split('.').map(x=>parseInt(x,10));
    return `${yy}-${pad2(mm)}-${pad2(dd)}`;
  }

  vacationsBtn.addEventListener('click', () => { vacYear = today.getFullYear(); openModal(vacationsModal); renderVacations(); });
  closeVacationsBtn.addEventListener('click', () => closeModal(vacationsModal));

  vacYearPrev.addEventListener('click', () => { vacYear -= 1; renderVacations(); });
  vacYearNext.addEventListener('click', () => { vacYear += 1; renderVacations(); });
  vacYearBtn.addEventListener('click', () => {});

  addVacationBtn.addEventListener('click', () => {
    editingVacId = null;
    vacationModalTitle.textContent = 'Добавить';
    const s = selectedISO;
    const d = parseISODate(selectedISO);
    const e = toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate()+1));
    vacStartBtn.textContent = `С: ${formatRu(s)}`;
    vacEndBtn.textContent = `По: ${formatRu(e)}`;
    openModal(vacationModal);
  });

  cancelVacationBtn.addEventListener('click', () => closeModal(vacationModal));

  vacStartBtn.addEventListener('click', () => {
    const cur = getVacStartISO();
    pickDate(cur, (iso) => {
      const start = iso;
      const end0 = getVacEndISO();
      const end = end0 < start ? start : end0;
      vacStartBtn.textContent = `С: ${formatRu(start)}`;
      vacEndBtn.textContent = `По: ${formatRu(end)}`;
    });
  });

  vacEndBtn.addEventListener('click', () => {
    const cur = getVacEndISO();
    pickDate(cur, (iso) => {
      const start = getVacStartISO();
      const end = iso < start ? start : iso;
      vacEndBtn.textContent = `По: ${formatRu(end)}`;
    });
  });

  saveVacationBtn.addEventListener('click', () => {
    const start = getVacStartISO();
    const end = getVacEndISO();
    if (editingVacId) {
      const v = state.vacations.find(x => x.id===editingVacId);
      if (v) { v.start=start; v.end=end; }
    } else {
      state.vacations.push({ id: uid('vac'), start, end });
    }
    saveState();
    closeModal(vacationModal);
    render();
    renderVacations();
  });


  // --- Settings ---
  settingsBtn.addEventListener('click', () => {
    segBtns.forEach(b => b.classList.toggle('active', b.dataset.gridline === state.settings.gridlines));
    openModal(settingsModal);
  });
  closeSettingsBtn.addEventListener('click', () => closeModal(settingsModal));
  tapOutsideClose(settingsModal);
  tapOutsideClose(searchModal);
  tapOutsideClose(hiddenModal);
  tapOutsideClose(birthdaysModal);
  tapOutsideClose(aboutModal);
  tapOutsideClose(colorPicker);
  tapOutsideClose(emojiPicker);
  tapOutsideClose(vacationsModal);
  tapOutsideClose(eventModal);
  tapOutsideClose(birthdayModal);
  tapOutsideClose(vacationModal);


  segBtns.forEach(b => b.addEventListener('click', () => {
    state.settings.gridlines = b.dataset.gridline;
    segBtns.forEach(x => x.classList.toggle('active', x===b));
    saveState();
    render();
  }));

  exportBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
  if (importBtn && importInput) importBtn.addEventListener('click', () => { importInput.value=''; importInput.click(); });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date();
    a.href = url;
    a.download = `kalendar_export_${ts.getFullYear()}${pad2(ts.getMonth()+1)}${pad2(ts.getDate())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  importInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      if (!imported || typeof imported !== 'object') throw new Error('bad');
      state.events = Array.isArray(imported.events) ? imported.events : state.events;
      state.hidden = Array.isArray(imported.hidden) ? imported.hidden : state.hidden;
      state.birthdays = Array.isArray(imported.birthdays) ? imported.birthdays : state.birthdays;
      state.emojiFreq = (imported.emojiFreq && typeof imported.emojiFreq === 'object') ? imported.emojiFreq : state.emojiFreq;
      state.settings = (imported.settings && typeof imported.settings === 'object') ? imported.settings : state.settings;
      saveState();
      render();
      closeModal(settingsModal);
    } catch (err) {
      console.warn(err);
    } finally {
      importInput.value = '';
    }
  });

  aboutBtn.addEventListener('click', () => openModal(aboutModal));
  closeAboutBtn.addEventListener('click', () => closeModal(aboutModal));

  searchBtn.addEventListener('click', () => { openModal(searchModal); renderSearch(); });
  closeSearchBtn.addEventListener('click', () => closeModal(searchModal));

  hiddenBtn.addEventListener('click', () => { openModal(hiddenModal); renderHidden(); });
  closeHiddenBtn.addEventListener('click', () => closeModal(hiddenModal));

  birthdaysBtn.addEventListener('click', () => { openModal(birthdaysModal); renderBirthdays(); });
  closeBirthdaysBtn.addEventListener('click', () => closeModal(birthdaysModal));

  // --- Add button ---
  addBtn.addEventListener('click', openNewEventModal);

  // --- Swipe calendar left/right to change month ---
  (function gridSwipe(){
    let sx=0, sy=0, dx=0, active=false;
    const threshold = 50;
    grid.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      sx = t.clientX; sy = t.clientY; dx = 0; active = true;
    }, {passive:true});
    grid.addEventListener('touchmove', (e) => {
      if (!active) return;
      const t = e.touches[0];
      dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (Math.abs(dx) < Math.abs(dy)) return;
    }, {passive:true});
    grid.addEventListener('touchend', () => {
      if (!active) return;
      active = false;
      if (dx <= -threshold) { // left
        viewMonth += 1;
        if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
        const d = parseISODate(selectedISO);
        const max = new Date(viewYear, viewMonth+1, 0).getDate();
        selectedISO = toISODate(new Date(viewYear, viewMonth, Math.min(d.getDate(), max)));
        render();
      } else if (dx >= threshold) { // right
        viewMonth -= 1;
        if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
        const d = parseISODate(selectedISO);
        const max = new Date(viewYear, viewMonth+1, 0).getDate();
        selectedISO = toISODate(new Date(viewYear, viewMonth, Math.min(d.getDate(), max)));
        render();
      }
    }, {passive:true});
  })();


  // --- Initial render ---
  function render(){
    renderGrid();
    renderDayPanel();
    updateHomeVisibility();
  }

  /*__DATE_INPUT_PATCH_V9__*/
  (function(){
    const endInputRow = document.getElementById('endInputRow');
    const endDateInput = document.getElementById('endDateInput');
    const endDateBtn = document.getElementById('endDateBtn');
    const addRangeBtn = document.getElementById('addRangeBtn');

    const vacStartInput = document.getElementById('vacStartInput');
    const vacEndInput = document.getElementById('vacEndInput');
    const vacStartBtn = document.getElementById('vacStartBtn');
    const vacEndBtn = document.getElementById('vacEndBtn');
    const vacationModal = document.getElementById('vacationModal');

    const pad2 = (n) => String(n).padStart(2,'0');
    const formatRuSafe = (iso) => {
      if (!iso) return '';
      const [y,m,d] = iso.split('-');
      return `${d}.${m}.${y}`;
    };
    const parseBtnISO = (txt) => {
      const t = (txt||'').split(':').slice(1).join(':').trim();
      const parts = t.split('.');
      if (parts.length !== 3) return '';
      const [dd,mm,yy] = parts;
      return `${yy}-${mm}-${dd}`;
    };

    // Event end date: intercept "+" to avoid hidden picker in iOS PWA
    if (addRangeBtn && endInputRow && endDateInput) {
      addRangeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();

        let startISO = '';
        const startDateBtn = document.getElementById('startDateBtn');
        if (startDateBtn) {
          const t = (startDateBtn.textContent||'').trim();
          const p = t.split('.');
          if (p.length===3) startISO = `${p[2]}-${p[1]}-${p[0]}`;
        }
        if (!startISO) {
          const now = new Date();
          startISO = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
        }

        endInputRow.classList.remove('hidden');
        endDateInput.value = startISO;
        if (endDateBtn) endDateBtn.dataset.iso = startISO;
      }, true);

      endDateInput.addEventListener('change', () => {
        if (endDateBtn) endDateBtn.dataset.iso = endDateInput.value || '';
      });
    }

    // Vacations: sync inputs <-> legacy button texts so existing save logic keeps working
    function syncVacInputsFromBtns(){
      if (!vacStartInput || !vacEndInput || !vacStartBtn || !vacEndBtn) return;
      const s = parseBtnISO(vacStartBtn.textContent);
      const e = parseBtnISO(vacEndBtn.textContent);
      if (s) vacStartInput.value = s;
      if (e) vacEndInput.value = e;
      if (s && (!vacEndInput.value || vacEndInput.value < s)) vacEndInput.value = s;
    }
    function syncVacBtnsFromInputs(){
      if (!vacStartInput || !vacEndInput || !vacStartBtn || !vacEndBtn) return;
      const s = vacStartInput.value;
      const e0 = vacEndInput.value;
      const e = (!e0 || (s && e0 < s)) ? s : e0;
      if (s) vacStartBtn.textContent = `С: ${formatRuSafe(s)}`;
      if (e) vacEndBtn.textContent = `По: ${formatRuSafe(e)}`;
      vacEndInput.value = e || '';
    }

    if (vacationModal) {
      const obs = new MutationObserver(() => {
        const open = !vacationModal.classList.contains('hidden');
        if (open) syncVacInputsFromBtns();
      });
      obs.observe(vacationModal, { attributes:true, attributeFilter:['class'] });
    }
    if (vacStartInput && vacEndInput) {
      vacStartInput.addEventListener('change', () => {
        if (vacEndInput.value && vacEndInput.value < vacStartInput.value) vacEndInput.value = vacStartInput.value;
        syncVacBtnsFromInputs();
      });
      vacEndInput.addEventListener('change', () => {
        if (vacStartInput.value && vacEndInput.value < vacStartInput.value) vacEndInput.value = vacStartInput.value;
        syncVacBtnsFromInputs();
      });
    }
  })();

  /*__END_INPUT_HOOK_V10__*/
  if (addRangeBtn && endInputRow && endDateInput) {
    addRangeBtn.addEventListener('click', (e) => {
      // Use date input for "По" to support iOS PWA reliably
      const startISO = getStartISO();
      endInputRow.classList.remove('hidden');
      endDateInput.value = startISO;
      addRangeBtn.classList.add('hidden');
      // do not block other handlers; but ensure endDateBtn stays in sync if used elsewhere
      if (typeof endDateBtn !== 'undefined' && endDateBtn) endDateBtn.dataset.iso = startISO;
    }, true);
    endDateInput.addEventListener('change', () => {
      const start = getStartISO();
      if (endDateInput.value && endDateInput.value < start) endDateInput.value = start;
      if (typeof endDateBtn !== 'undefined' && endDateBtn) endDateBtn.dataset.iso = endDateInput.value || '';
    });
  }
  render();
})();